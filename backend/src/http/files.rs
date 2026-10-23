//! File browser endpoints for a sandbox. Reads are plain GETs; uploads,
//! directory creation and deletion are writes: refused in read-only mode,
//! CSRF-guarded like every non-GET request, and audited.

use std::collections::BTreeMap;

use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::header,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};

use super::reads::{ScopeQuery, sandbox_name};
use crate::{
    audit::Entry,
    error::{ApiError, ApiResult},
    exec::Target,
    sandbox_fs::{MAX_FILE, SandboxFs},
    state::AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/gw/{gw}/sandboxes/{name}/files", get(list).delete(remove))
        .route(
            "/api/gw/{gw}/sandboxes/{name}/files/content",
            get(download).put(upload).layer(DefaultBodyLimit::max(MAX_FILE)),
        )
        .route("/api/gw/{gw}/sandboxes/{name}/files/mkdir", post(mkdir))
}

#[derive(Deserialize)]
struct FileQuery {
    #[serde(flatten)]
    scope: ScopeQuery,
    path: String,
}

/// Resolves the request to a client and target, and runs `op` on it.
async fn with_fs<T>(
    s: &AppState,
    gw: &str,
    name: &str,
    q: &FileQuery,
    op: impl AsyncFnOnce(&SandboxFs<'_>) -> ApiResult<T>,
) -> ApiResult<T> {
    let client = s.gateways.client(gw)?;
    let target = Target { workspace: q.scope.workspace()?, sandbox: sandbox_name(name)?.to_owned() };
    op(&SandboxFs { client: &client, target }).await
}

/// Runs a write operation: read-only check, the operation, then the audit entry.
async fn write_op(
    s: &AppState,
    gw: &str,
    name: &str,
    q: &FileQuery,
    action: &str,
    op: impl AsyncFnOnce(&SandboxFs<'_>) -> ApiResult<()>,
) -> ApiResult<Json<Value>> {
    if s.read_only {
        return Err(ApiError::read_only());
    }
    let result = with_fs(s, gw, name, q, op).await;
    let target = BTreeMap::from([("sandbox".to_owned(), name.to_owned()), ("path".to_owned(), q.path.clone())]);
    let workspace = q.scope.workspace.as_deref().unwrap_or_default();
    s.audit.record(&Entry::with_target(gw, workspace, action, target, result.as_ref().map(|_| ())));
    result.map(|()| Json(json!({})))
}

async fn list(
    State(s): State<AppState>,
    Path((gw, name)): Path<(String, String)>,
    Query(q): Query<FileQuery>,
) -> ApiResult<Json<Value>> {
    let entries = with_fs(&s, &gw, &name, &q, async |fs| fs.list(&q.path).await).await?;
    Ok(Json(json!({ "path": q.path, "entries": entries })))
}

async fn download(
    State(s): State<AppState>,
    Path((gw, name)): Path<(String, String)>,
    Query(q): Query<FileQuery>,
) -> ApiResult<Response> {
    let data = with_fs(&s, &gw, &name, &q, async |fs| fs.read(&q.path).await).await?;
    let disposition = content_disposition(q.path.rsplit('/').next().unwrap_or_default());
    Ok((
        [(header::CONTENT_TYPE, "application/octet-stream".to_owned()), (header::CONTENT_DISPOSITION, disposition)],
        data,
    )
        .into_response())
}

async fn upload(
    State(s): State<AppState>,
    Path((gw, name)): Path<(String, String)>,
    Query(q): Query<FileQuery>,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    write_op(&s, &gw, &name, &q, "UploadFile", async |fs| fs.write(&q.path, body).await).await
}

async fn mkdir(
    State(s): State<AppState>,
    Path((gw, name)): Path<(String, String)>,
    Query(q): Query<FileQuery>,
) -> ApiResult<Json<Value>> {
    write_op(&s, &gw, &name, &q, "MakeDirectory", async |fs| fs.mkdir(&q.path).await).await
}

async fn remove(
    State(s): State<AppState>,
    Path((gw, name)): Path<(String, String)>,
    Query(q): Query<FileQuery>,
) -> ApiResult<Json<Value>> {
    write_op(&s, &gw, &name, &q, "DeletePath", async |fs| fs.remove(&q.path).await).await
}

/// An attachment header with an ASCII fallback name and the exact UTF-8 name
/// (RFC 6266 `filename*`).
fn content_disposition(name: &str) -> String {
    let name = if name.is_empty() { "download" } else { name };
    let ascii: String =
        name.chars().map(|c| if c.is_ascii_graphic() && c != '"' && c != '\\' || c == ' ' { c } else { '_' }).collect();
    let encoded: String = url::form_urlencoded::byte_serialize(name.as_bytes()).collect::<String>().replace('+', "%20");
    format!("attachment; filename=\"{ascii}\"; filename*=UTF-8''{encoded}")
}

#[cfg(test)]
mod tests {
    use super::content_disposition;

    #[test]
    fn disposition_handles_quotes_and_unicode() {
        assert_eq!(content_disposition("a b.txt"), "attachment; filename=\"a b.txt\"; filename*=UTF-8''a%20b.txt");
        assert_eq!(
            content_disposition("rés\"umé.pdf"),
            "attachment; filename=\"r_s_um_.pdf\"; filename*=UTF-8''r%C3%A9s%22um%C3%A9.pdf"
        );
        assert!(content_disposition("").contains("download"));
    }
}
