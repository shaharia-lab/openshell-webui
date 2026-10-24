//! The session and about endpoints, the allowlisted generic call endpoint,
//! document conversion and the audit log.

use axum::{
    Json, Router,
    body::Bytes,
    extract::{Path, Query, State},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};

use super::proto_json::ProtoJson;
use crate::{
    about,
    audit::Entry,
    convert,
    error::{ApiError, ApiResult},
    redact, reflect,
    rpcs::{self, Access},
    state::AppState,
    validate,
    workspace::Workspace,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/session", get(session))
        .route("/api/about", get(|State(s): State<AppState>| async move { Json(about::about(&s.updates).await) }))
        .route("/api/gw/{gw}/call/{method}", post(call))
        .route("/api/convert/policy", post(|body: String| async move { convert::policy(&body).map(ProtoJson) }))
        .route("/api/convert/profile", post(|body: String| async move { convert::profile(&body).map(ProtoJson) }))
        .route("/api/audit", get(audit))
}

async fn session(State(s): State<AppState>) -> Json<Value> {
    Json(json!({ "csrf_token": s.csrf_token, "read_only": s.read_only }))
}

#[derive(Deserialize)]
struct CallQuery {
    workspace: Option<String>,
    /// `platform` calls a profile method without a workspace scope.
    scope: Option<String>,
}

/// Runs one allowlisted gateway method. The body is the request in proto
/// JSON; the server sets the workspace from `?workspace=` (or none with
/// `?scope=platform`) and drops any `request_id` (see `reflect::clear_request_id`).
async fn call(
    State(s): State<AppState>,
    Path((gw, method_name)): Path<(String, String)>,
    Query(q): Query<CallQuery>,
    body: Bytes,
) -> ApiResult<ProtoJson> {
    let access = rpcs::lookup(&method_name)
        .ok_or_else(|| ApiError::not_found(format!("method not available in the WebUI: {method_name}")))?;
    if access == Access::Write && s.read_only {
        return Err(ApiError::read_only());
    }
    let method = reflect::method(&method_name)?;
    let body: Value = if body.iter().all(u8::is_ascii_whitespace) {
        json!({})
    } else {
        serde_json::from_slice(&body)
            .map_err(|e| ApiError::bad_request(format!("invalid {method_name} request: {e}")))?
    };
    let mut request = reflect::from_json(&method.input(), body)
        .map_err(|e| ApiError::bad_request(format!("invalid {method_name} request: {}", e.message)))?;
    if redact::has_mask(&request) {
        return Err(ApiError::bad_request(format!(
            "request contains a redacted value ({}); enter the real secret or leave the field out",
            redact::MASK
        )));
    }
    let workspace = Workspace::parse(q.workspace.as_deref())?;
    let platform = match q.scope.as_deref() {
        None | Some("") => false,
        Some("platform") if rpcs::platform_scoped(&method_name) => true,
        Some("platform") => return Err(ApiError::bad_request(format!("{method_name} has no platform scope"))),
        Some(_) => return Err(ApiError::bad_request("invalid scope")),
    };
    if platform {
        reflect::clear_workspace(&mut request);
    } else {
        reflect::set_workspace(&mut request, workspace.selector())?;
    }
    reflect::clear_request_id(&mut request);

    let timeout = if access == Access::Write { s.write_timeout } else { s.gateways.timeout() };
    let result = s.gateways.call(&gw, &method, request.clone(), timeout).await;
    if access == Access::Write {
        let label =
            if platform { "platform" } else { q.workspace.as_deref().map(|_| workspace.label()).unwrap_or_default() };
        s.audit.record(&Entry::new(&gw, label, &method_name, &request, result.as_ref().map(|_| ())));
    }
    result.map(ProtoJson)
}

#[derive(Deserialize)]
struct AuditQuery {
    n: Option<String>,
}

async fn audit(State(s): State<AppState>, Query(q): Query<AuditQuery>) -> Json<Value> {
    let n = validate::clamp(q.n.as_deref(), 200, 1, 2000) as usize;
    Json(json!({ "path": s.audit.path(), "entries": s.audit.tail(n) }))
}
