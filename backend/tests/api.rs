//! End-to-end tests of the HTTP API against an in-process fake gateway.

use std::{
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::Duration,
};

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use openshell_webui::{
    about::Updates,
    audit::AuditLog,
    gateway::{Gateways, Registry},
    http::router,
    local::gateway_log::LogSource,
    proto::{
        api::{
            open_shell_server::{OpenShell, OpenShellServer},
            *,
        },
        openshell::datamodel::v1::{ObjectMeta, Provider, workspace_selector},
    },
    state::{self, AppState, Inner},
};
use serde_json::{Value, json};
use tempfile::TempDir;
use tokio_stream::wrappers::TcpListenerStream;
use tonic::{Response, Status};
use tower::ServiceExt;

const HOST: &str = "127.0.0.1:8787";
const CSRF: &str = "test-csrf-token";

/// A gateway that implements just enough methods for the tests and records
/// the write requests it receives.
#[derive(Default, Clone)]
struct FakeGateway {
    deletes: Arc<Mutex<Vec<DeleteSandboxRequest>>>,
    /// Files written through the fake `cat > "$1"`, by path, plus the size of
    /// every stdin chunk received.
    files: Arc<Mutex<std::collections::HashMap<String, Vec<u8>>>>,
    stdin_chunks: Arc<Mutex<Vec<usize>>>,
}

type EventStream = std::pin::Pin<Box<dyn futures::Stream<Item = Result<ExecSandboxEvent, Status>> + Send>>;

fn stdout(data: &[u8]) -> ExecSandboxEvent {
    ExecSandboxEvent { payload: Some(exec_sandbox_event::Payload::Stdout(ExecSandboxStdout { data: data.to_vec() })) }
}

fn stderr(data: &str) -> ExecSandboxEvent {
    ExecSandboxEvent {
        payload: Some(exec_sandbox_event::Payload::Stderr(ExecSandboxStderr { data: data.as_bytes().to_vec() })),
    }
}

fn exit(code: i32) -> ExecSandboxEvent {
    ExecSandboxEvent { payload: Some(exec_sandbox_event::Payload::Exit(ExecSandboxExit { exit_code: code })) }
}

fn sandbox(name: &str) -> Sandbox {
    Sandbox { metadata: Some(ObjectMeta { name: name.into(), ..Default::default() }), ..Default::default() }
}

#[tonic::async_trait]
impl OpenShell for FakeGateway {
    async fn health(&self, _: tonic::Request<HealthRequest>) -> Result<Response<HealthResponse>, Status> {
        Ok(Response::new(HealthResponse { status: ServiceStatus::Healthy.into(), version: "test".into() }))
    }

    async fn list_sandboxes(
        &self,
        req: tonic::Request<ListSandboxesRequest>,
    ) -> Result<Response<ListSandboxesResponse>, Status> {
        let page = match req.into_inner().page_token.as_str() {
            "" => ListSandboxesResponse { sandboxes: vec![sandbox("one")], next_page_token: "p2".into() },
            "p2" => ListSandboxesResponse { sandboxes: vec![sandbox("two")], next_page_token: String::new() },
            other => return Err(Status::invalid_argument(format!("bad token {other}"))),
        };
        Ok(Response::new(page))
    }

    async fn get_provider(&self, _: tonic::Request<GetProviderRequest>) -> Result<Response<ProviderResponse>, Status> {
        let provider = Provider {
            r#type: "anthropic".into(),
            credentials: [("API_KEY".to_owned(), "sk-not-a-real-key".to_owned())].into(),
            ..Default::default()
        };
        Ok(Response::new(ProviderResponse { provider: Some(provider), ..Default::default() }))
    }

    /// Emulates the few shell scripts the file browser runs.
    async fn exec_sandbox_interactive(
        &self,
        req: tonic::Request<tonic::Streaming<ExecSandboxInput>>,
    ) -> Result<Response<EventStream>, Status> {
        use futures::StreamExt;
        let mut input = req.into_inner();
        let Some(Ok(ExecSandboxInput { payload: Some(exec_sandbox_input::Payload::Start(start)) })) =
            input.next().await
        else {
            return Err(Status::invalid_argument("expected start"));
        };
        let mut stdin = Vec::new();
        while let Some(Ok(msg)) = input.next().await {
            if let Some(exec_sandbox_input::Payload::Stdin(chunk)) = msg.payload {
                self.stdin_chunks.lock().unwrap().push(chunk.len());
                stdin.extend(chunk);
            }
        }
        let (script, path) = (start.command[2].as_str(), start.command[4].clone());
        let mut files = self.files.lock().unwrap();
        let events = if script.starts_with("cat >") {
            files.insert(path, stdin);
            vec![exit(0)]
        } else if script.starts_with("test -f") {
            match files.get(&path) {
                Some(data) => vec![stdout(data), exit(0)],
                None => vec![stderr(&format!("not a regular file: {path}")), exit(1)],
            }
        } else if script.starts_with("find") {
            vec![
                stdout(b"f\t3\t1700000000.0\t644\tsandbox\t\tb.txt\0d\t4096\t1700000000.0\t755\tsandbox\t\ta\0"),
                exit(0),
            ]
        } else {
            vec![stderr("unsupported"), exit(2)]
        };
        Ok(Response::new(Box::pin(futures::stream::iter(events.into_iter().map(Ok)))))
    }

    async fn delete_sandbox(
        &self,
        req: tonic::Request<DeleteSandboxRequest>,
    ) -> Result<Response<DeleteSandboxResponse>, Status> {
        let req = req.into_inner();
        if req.name == "forbidden" {
            return Err(Status::permission_denied("not yours"));
        }
        self.deletes.lock().unwrap().push(req);
        Ok(Response::new(DeleteSandboxResponse::default()))
    }
}

struct Harness {
    app: Router,
    fake: FakeGateway,
    audit: AuditLog,
    _dir: TempDir,
}

async fn harness(read_only: bool) -> Harness {
    harness_with(read_only, Updates::new(None)).await
}

async fn harness_with(read_only: bool, updates: Updates) -> Harness {
    let fake = FakeGateway::default();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = OpenShellServer::new(fake.clone());
    tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(server)
            .serve_with_incoming(TcpListenerStream::new(listener))
            .await
            .unwrap();
    });

    let dir = tempfile::tempdir().unwrap();
    let gw_dir = dir.path().join("gateways/fake");
    std::fs::create_dir_all(&gw_dir).unwrap();
    std::fs::write(gw_dir.join("metadata.json"), json!({ "gateway_endpoint": format!("http://{addr}") }).to_string())
        .unwrap();

    let audit = AuditLog::new(dir.path().join("audit.jsonl"));
    let app = router(AppState::new(Inner {
        gateways: Gateways::new(Registry::new(dir.path()), Duration::from_secs(5)),
        audit: audit.clone(),
        docker: None,
        gateway_logs: LogSource::Files(dir.path().join("logs")),
        read_only,
        csrf_token: CSRF.into(),
        allowed_hosts: state::allowed_hosts(HOST.parse::<SocketAddr>().unwrap(), &[]),
        write_timeout: Duration::from_secs(5),
        updates,
    }));
    Harness { app, fake, audit, _dir: dir }
}

async fn send(app: &Router, req: Request<Body>) -> (StatusCode, Value) {
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn get(path: &str) -> Request<Body> {
    Request::get(path).header("host", HOST).body(Body::empty()).unwrap()
}

fn post(path: &str, body: Value) -> Request<Body> {
    Request::post(path)
        .header("host", HOST)
        .header("origin", format!("http://{HOST}"))
        .header("x-csrf-token", CSRF)
        .body(Body::from(body.to_string()))
        .unwrap()
}

#[tokio::test]
async fn reads_pass_through_and_lists_are_paginated() {
    let h = harness(false).await;
    let (status, body) = send(&h.app, get("/api/gw/fake/health")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({"status": "SERVICE_STATUS_HEALTHY", "version": "test"}));

    let (status, body) = send(&h.app, get("/api/gw/fake/sandboxes")).await;
    assert_eq!(status, StatusCode::OK);
    let names: Vec<_> = body["sandboxes"].as_array().unwrap().iter().map(|s| s["metadata"]["name"].clone()).collect();
    assert_eq!(names, [json!("one"), json!("two")]);
    assert!(body.get("next_page_token").is_none());

    let (status, body) = send(&h.app, get("/api/gateways")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body[0]["name"], "fake");
    assert_eq!(body[0]["auth_mode"], "plaintext");
}

#[tokio::test]
async fn secrets_are_redacted() {
    let h = harness(false).await;
    let (status, body) = send(&h.app, post("/api/gw/fake/call/GetProvider", json!({"name": "p"}))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["provider"]["credentials"]["API_KEY"], "[redacted]");
    assert_eq!(body["provider"]["type"], "anthropic");
}

#[tokio::test]
async fn writes_fill_workspace_and_request_id_and_are_audited() {
    let h = harness(false).await;
    let (status, _) = send(&h.app, post("/api/gw/fake/call/DeleteSandbox?workspace=team", json!({"name": "sb"}))).await;
    assert_eq!(status, StatusCode::OK);

    let req = h.fake.deletes.lock().unwrap().pop().unwrap();
    assert_eq!(
        req.workspace_scope.and_then(|w| w.selection),
        Some(workspace_selector::Selection::Workspace("team".into()))
    );
    let entries = h.audit.tail(10);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["method"], "DeleteSandbox");
    assert_eq!(entries[0]["workspace"], "team");
    assert_eq!(entries[0]["target"]["name"], "sb");
    assert_eq!(entries[0]["result"], "ok");
}

#[tokio::test]
async fn gateway_errors_map_to_http_and_are_audited() {
    let h = harness(false).await;
    let (status, body) = send(&h.app, post("/api/gw/fake/call/DeleteSandbox", json!({"name": "forbidden"}))).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body, json!({"error": "not yours", "code": "PermissionDenied"}));
    assert_eq!(h.audit.tail(1)[0]["result"], "PermissionDenied");

    let (status, body) = send(&h.app, post("/api/gw/fake/call/StartSandbox", json!({"name": "x"}))).await;
    assert_eq!(status, StatusCode::NOT_IMPLEMENTED);
    assert_eq!(body["code"], "Unimplemented");
}

#[tokio::test]
async fn read_only_mode_refuses_writes_but_allows_reads() {
    let h = harness(true).await;
    let (status, _) = send(&h.app, post("/api/gw/fake/call/DeleteSandbox", json!({"name": "sb"}))).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert!(h.fake.deletes.lock().unwrap().is_empty());
    let (status, _) = send(&h.app, post("/api/gw/fake/call/GetProvider", json!({"name": "p"}))).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn request_guards() {
    let h = harness(false).await;
    let wrong_host = Request::get("/api/session").header("host", "evil.example:8787").body(Body::empty()).unwrap();
    assert_eq!(send(&h.app, wrong_host).await.0, StatusCode::MISDIRECTED_REQUEST);

    let cross_site = Request::get("/api/session")
        .header("host", HOST)
        .header("sec-fetch-site", "cross-site")
        .body(Body::empty())
        .unwrap();
    assert_eq!(send(&h.app, cross_site).await.0, StatusCode::FORBIDDEN);

    let mut no_token = post("/api/gw/fake/call/DeleteSandbox", json!({"name": "sb"}));
    no_token.headers_mut().remove("x-csrf-token");
    assert_eq!(send(&h.app, no_token).await.0, StatusCode::FORBIDDEN);

    let mut foreign = post("/api/gw/fake/call/DeleteSandbox", json!({"name": "sb"}));
    foreign.headers_mut().insert("origin", "http://evil.example".parse().unwrap());
    assert_eq!(send(&h.app, foreign).await.0, StatusCode::FORBIDDEN);
    assert!(h.fake.deletes.lock().unwrap().is_empty());
}

#[tokio::test]
async fn invalid_requests_are_rejected_before_the_gateway() {
    let h = harness(false).await;
    let cases = [
        (post("/api/gw/fake/call/IssueSandboxToken", json!({})), StatusCode::NOT_FOUND),
        (post("/api/gw/fake/call/DeleteSandbox", json!({"bogus": 1})), StatusCode::BAD_REQUEST),
        (post("/api/gw/fake/call/DeleteSandbox?workspace=bad%20name", json!({"name": "x"})), StatusCode::BAD_REQUEST),
        (
            post("/api/gw/fake/call/UpdateProvider", json!({"provider": {"credentials": {"K": "[redacted]"}}})),
            StatusCode::BAD_REQUEST,
        ),
        (get("/api/gw/missing/health"), StatusCode::NOT_FOUND),
        (get("/api/gw/fake/sandboxes/bad%20name"), StatusCode::BAD_REQUEST),
        (get("/api/gw/fake/sandboxes/x/logs?level=loud"), StatusCode::BAD_REQUEST),
        (get("/api/nope"), StatusCode::NOT_FOUND),
    ];
    for (req, want) in cases {
        let uri = req.uri().clone();
        assert_eq!(send(&h.app, req).await.0, want, "{uri}");
    }
    assert!(h.fake.deletes.lock().unwrap().is_empty());
}

#[tokio::test]
async fn session_and_convert() {
    let h = harness(true).await;
    let (_, body) = send(&h.app, get("/api/session")).await;
    assert_eq!(body, json!({"csrf_token": CSRF, "read_only": true}));

    let req = Request::post("/api/convert/profile")
        .header("host", HOST)
        .header("origin", format!("http://{HOST}"))
        .header("x-csrf-token", CSRF)
        .body(Body::from("id: x\ncategory: agent\n"))
        .unwrap();
    let (status, body) = send(&h.app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["category"], "PROVIDER_PROFILE_CATEGORY_AGENT");
}

#[tokio::test]
async fn file_browser_round_trip() {
    let h = harness(false).await;
    let big: Vec<u8> = (0..1_300_000u32).map(|i| (i % 251) as u8).collect();
    let upload = Request::put("/api/gw/fake/sandboxes/sb/files/content?path=/sandbox/big.bin")
        .header("host", HOST)
        .header("origin", format!("http://{HOST}"))
        .header("x-csrf-token", CSRF)
        .body(Body::from(big.clone()))
        .unwrap();
    assert_eq!(send(&h.app, upload).await.0, StatusCode::OK);
    // Stdin is chunked below the gateway's 1 MiB message limit.
    assert!(h.fake.stdin_chunks.lock().unwrap().iter().all(|&n| n <= 512 * 1024));
    assert_eq!(h.fake.files.lock().unwrap()["/sandbox/big.bin"], big);

    let res =
        h.app.clone().oneshot(get("/api/gw/fake/sandboxes/sb/files/content?path=/sandbox/big.bin")).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert!(res.headers()["content-disposition"].to_str().unwrap().starts_with("attachment; filename=\"big.bin\""));
    assert_eq!(res.into_body().collect().await.unwrap().to_bytes().to_vec(), big);

    let (status, body) = send(&h.app, get("/api/gw/fake/sandboxes/sb/files?path=/sandbox")).await;
    assert_eq!(status, StatusCode::OK);
    let names: Vec<_> = body["entries"].as_array().unwrap().iter().map(|e| e["name"].clone()).collect();
    assert_eq!(names, [json!("a"), json!("b.txt")], "directories first");

    let (status, body) = send(&h.app, get("/api/gw/fake/sandboxes/sb/files/content?path=/missing")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "not a regular file: /missing");

    let (status, _) = send(&h.app, get("/api/gw/fake/sandboxes/sb/files?path=/sandbox/../etc")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(h.audit.tail(10)[0]["method"], "UploadFile");
}

#[tokio::test]
async fn file_writes_are_refused_in_read_only_mode() {
    let h = harness(true).await;
    let req = Request::post("/api/gw/fake/sandboxes/sb/files/mkdir?path=/sandbox/x")
        .header("host", HOST)
        .header("origin", format!("http://{HOST}"))
        .header("x-csrf-token", CSRF)
        .body(Body::empty())
        .unwrap();
    assert_eq!(send(&h.app, req).await.0, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn about_reports_versions_without_an_update_check() {
    let h = harness(false).await;
    let (status, body) = send(&h.app, get("/api/about")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["version"], env!("CARGO_PKG_VERSION"));
    assert_eq!(body["repository"], "https://github.com/shaharia-lab/openshell-webui");
    assert_eq!(body["update_check"], false);
    assert_eq!(body["latest_release"], Value::Null);
    assert_eq!(body["update_available"], false);
}

/// Serves `tag` as GitHub's latest release and counts the requests.
async fn fake_releases(tag: &'static str) -> (String, Arc<Mutex<usize>>) {
    let hits = Arc::new(Mutex::new(0));
    let counter = hits.clone();
    let app =
        Router::new().route(
            "/latest",
            axum::routing::get(move || {
                *counter.lock().unwrap() += 1;
                async move {
                    axum::Json(json!({ "tag_name": tag, "html_url": format!("https://example.test/releases/{tag}") }))
                }
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{addr}/latest"), hits)
}

#[tokio::test]
async fn about_reports_a_newer_release_and_caches_the_lookup() {
    let (url, hits) = fake_releases("v99.0.0").await;
    let h = harness_with(false, Updates::new(Some(url))).await;
    let (_, body) = send(&h.app, get("/api/about")).await;
    assert_eq!(body["update_check"], true);
    assert_eq!(body["latest_release"], json!({ "version": "99.0.0", "url": "https://example.test/releases/v99.0.0" }));
    assert_eq!(body["update_available"], true);
    send(&h.app, get("/api/about")).await;
    assert_eq!(*hits.lock().unwrap(), 1);
}

#[tokio::test]
async fn about_does_not_offer_an_older_or_unreachable_release() {
    let (url, _) = fake_releases("v0.0.1").await;
    let h = harness_with(false, Updates::new(Some(url))).await;
    let (_, body) = send(&h.app, get("/api/about")).await;
    assert_eq!(body["latest_release"]["version"], "0.0.1");
    assert_eq!(body["update_available"], false);

    let h = harness_with(false, Updates::new(Some("http://127.0.0.1:1/latest".into()))).await;
    let (status, body) = send(&h.app, get("/api/about")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["latest_release"], Value::Null);
    assert_eq!(body["update_available"], false);
}
