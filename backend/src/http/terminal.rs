//! WebSocket terminal bridged to `ExecSandboxInteractive`.
//!
//! Browser to server: binary frames are stdin, text frames are
//! `{"type":"resize","cols":..,"rows":..}`. Server to browser: binary frames
//! are output, text frames are `{"type":"exit","code":..}` or
//! `{"type":"error","message":..}`.

use axum::{
    Router,
    extract::{
        Path, Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::Response,
    routing::get,
};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use super::reads::{ScopeQuery, sandbox_name};
use crate::{
    audit::Entry,
    error::{ApiError, ApiResult},
    proto::api::{
        ExecSandboxInput, ExecSandboxRequest, ExecSandboxWindowResize, exec_sandbox_event, exec_sandbox_input,
    },
    reflect,
    state::AppState,
    validate,
};

/// Prefers bash and falls back to sh for minimal images.
const DEFAULT_SHELL: &str = "if command -v bash >/dev/null 2>&1; then exec bash -il; else exec sh -il; fi";

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/gw/{gw}/sandboxes/{name}/exec", get(exec))
}

#[derive(Deserialize)]
struct ExecQuery {
    #[serde(flatten)]
    scope: ScopeQuery,
    cols: Option<String>,
    rows: Option<String>,
    command: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum Control {
    Resize { cols: u32, rows: u32 },
    Exit { code: i32 },
    Error { message: String },
}

async fn exec(
    State(s): State<AppState>,
    Path((gw, name)): Path<(String, String)>,
    Query(q): Query<ExecQuery>,
    upgrade: WebSocketUpgrade,
) -> ApiResult<Response> {
    if s.read_only {
        return Err(ApiError::read_only());
    }
    let name = sandbox_name(&name)?.to_owned();
    let workspace = q.scope.workspace()?;
    let client = s.gateways.client(&gw)?;
    let command = match q.command.as_deref().map(str::trim) {
        Some(c) if !c.is_empty() => c.to_owned(),
        _ => DEFAULT_SHELL.to_owned(),
    };
    let start = ExecSandboxRequest {
        workspace_scope: Some(workspace.selector_proto()),
        sandbox: name,
        command: vec!["/bin/sh".into(), "-c".into(), command],
        tty: true,
        cols: validate::clamp(q.cols.as_deref(), 80, 10, 1000),
        rows: validate::clamp(q.rows.as_deref(), 24, 5, 1000),
        ..Default::default()
    };
    let audit_workspace = q.scope.workspace.as_deref().map(|_| workspace.label().to_owned()).unwrap_or_default();
    Ok(upgrade.max_message_size(1 << 20).on_upgrade(move |socket| async move {
        let dynamic = reflect::to_dynamic(&start, "openshell.v1.ExecSandboxRequest");
        s.audit.record(&Entry::new(&gw, &audit_workspace, "ExecSandboxInteractive", &dynamic, Ok(())));
        bridge(socket, client, start).await;
    }))
}

async fn bridge(socket: WebSocket, client: crate::gateway::GatewayClient, start: ExecSandboxRequest) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let (in_tx, in_rx) = mpsc::channel::<ExecSandboxInput>(64);
    let first = ExecSandboxInput { payload: Some(exec_sandbox_input::Payload::Start(start)) };
    let _ = in_tx.send(first).await;

    let opened = match client.request(ReceiverStream::new(in_rx), None) {
        Ok(req) => client.typed().exec_sandbox_interactive(req).await,
        Err(status) => Err(status),
    };
    let mut events = match opened {
        Ok(res) => res.into_inner(),
        Err(status) => {
            let _ = ws_tx.send(control(&Control::Error { message: status.message().to_owned() })).await;
            return;
        }
    };

    // Browser -> sandbox. Ends when the socket closes or the stream fails.
    let forward = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            let payload = match msg {
                Message::Binary(data) => exec_sandbox_input::Payload::Stdin(data.to_vec()),
                Message::Text(text) => match serde_json::from_str::<Control>(&text) {
                    Ok(Control::Resize { cols, rows }) if cols > 0 && rows > 0 => {
                        exec_sandbox_input::Payload::Resize(ExecSandboxWindowResize { cols, rows })
                    }
                    _ => continue,
                },
                Message::Close(_) => break,
                _ => continue,
            };
            if in_tx.send(ExecSandboxInput { payload: Some(payload) }).await.is_err() {
                break;
            }
        }
    });

    // Sandbox -> browser.
    loop {
        let out = match events.message().await {
            Ok(Some(ev)) => match ev.payload {
                Some(exec_sandbox_event::Payload::Stdout(o)) => Message::Binary(o.data.into()),
                Some(exec_sandbox_event::Payload::Stderr(e)) => Message::Binary(e.data.into()),
                Some(exec_sandbox_event::Payload::Exit(x)) => {
                    let _ = ws_tx.send(control(&Control::Exit { code: x.exit_code })).await;
                    break;
                }
                None => continue,
            },
            Ok(None) => break,
            Err(status) => {
                if !forward.is_finished() {
                    tracing::warn!("exec stream: {status}");
                    let _ = ws_tx.send(control(&Control::Error { message: status.message().to_owned() })).await;
                }
                break;
            }
        };
        if ws_tx.send(out).await.is_err() {
            break;
        }
    }
    let _ = ws_tx.send(Message::Close(None)).await;
    forward.abort();
}

fn control(c: &Control) -> Message {
    Message::Text(serde_json::to_string(c).expect("control messages serialize").into())
}
