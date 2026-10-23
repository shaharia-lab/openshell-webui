//! Read endpoints. Most map one route to one gateway method; the factories
//! below build those handlers from the method name so each route is one line.

use std::time::{Duration, SystemTime};

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::{MethodRouter, get},
};
use prost_reflect::ReflectMessage;
use serde::Deserialize;
use serde_json::{Value, json};

use super::proto_json::ProtoJson;
use crate::{
    error::{ApiError, ApiResult},
    gateway::Gateway,
    state::AppState,
    validate,
    workspace::Workspace,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/gateways", get(gateways))
        .route("/api/gw/{gw}/health", unary("Health"))
        .route("/api/gw/{gw}/whoami", unary("GetCurrentUser"))
        .route("/api/gw/{gw}/info", unary("GetGatewayInfo"))
        .route("/api/gw/{gw}/workspaces", list("ListWorkspaces", "workspaces", false))
        .route("/api/gw/{gw}/sandboxes", list("ListSandboxes", "sandboxes", true))
        .route("/api/gw/{gw}/providers", list("ListProviders", "providers", true))
        .route("/api/gw/{gw}/profiles", list("ListProviderProfiles", "profiles", true))
        .route("/api/gw/{gw}/services", list("ListServices", "services", true))
        .route("/api/gw/{gw}/templates", list("ListSandboxTemplates", "templates", true))
        .route("/api/gw/{gw}/sandboxes/{name}", sandbox_get("GetSandbox", "name"))
        .route("/api/gw/{gw}/sandboxes/{name}/policy", sandbox_get("GetSandboxPolicyStatus", "sandbox"))
        .route("/api/gw/{gw}/sandboxes/{name}/effective-policy", get(effective_policy))
        .route("/api/gw/{gw}/sandboxes/{name}/policy-history", get(policy_history))
        .route("/api/gw/{gw}/sandboxes/{name}/logs", get(logs))
}

#[derive(Debug, Default, Deserialize)]
pub struct ScopeQuery {
    pub workspace: Option<String>,
}

impl ScopeQuery {
    pub fn workspace(&self) -> Result<Workspace, ApiError> {
        Workspace::parse(self.workspace.as_deref())
    }
}

/// Validates the `{name}` path segment of sandbox routes.
pub fn sandbox_name(name: &str) -> Result<&str, ApiError> {
    if validate::is_name(name) { Ok(name) } else { Err(ApiError::bad_request("invalid sandbox name")) }
}

async fn gateways(State(s): State<AppState>) -> ApiResult<Json<Vec<Gateway>>> {
    Ok(Json(s.gateways.registry().list()?))
}

/// A method without arguments.
fn unary(method: &'static str) -> MethodRouter<AppState> {
    get(move |State(s): State<AppState>, Path(gw): Path<String>| async move {
        s.gateways.call_json(&gw, method, json!({})).await.map(ProtoJson)
    })
}

/// A paginated list, optionally scoped to `?workspace=`.
fn list(method: &'static str, items: &'static str, scoped: bool) -> MethodRouter<AppState> {
    get(move |State(s): State<AppState>, Path(gw): Path<String>, Query(q): Query<ScopeQuery>| async move {
        let request = if scoped { json!({ "workspace_scope": q.workspace()?.selector() }) } else { json!({}) };
        s.gateways.list_all(&gw, method, request, items).await.map(ProtoJson)
    })
}

/// A method that takes the sandbox name (in `name_field`) and a workspace.
fn sandbox_get(method: &'static str, name_field: &'static str) -> MethodRouter<AppState> {
    get(
        move |State(s): State<AppState>, Path((gw, name)): Path<(String, String)>, Query(q): Query<ScopeQuery>| async move {
            let request = json!({ name_field: sandbox_name(&name)?, "workspace_scope": q.workspace()?.selector() });
            s.gateways.call_json(&gw, method, request).await.map(ProtoJson)
        },
    )
}

/// Fields of `GetSandboxConfigResponse` that describe the policy; the rest
/// is supervisor wiring the UI has no use for.
const EFFECTIVE_POLICY_FIELDS: &[&str] = &[
    "policy",
    "version",
    "policy_hash",
    "policy_source",
    "global_policy_version",
    "settings",
    "workspace",
    "configuration_admitted",
    "configuration_error",
];

/// The composed policy the supervisor enforces, including rules added by
/// attached providers (CLI: `policy get --full`).
async fn effective_policy(
    State(s): State<AppState>,
    Path((gw, name)): Path<(String, String)>,
    Query(q): Query<ScopeQuery>,
) -> ApiResult<ProtoJson> {
    let request = json!({ "name": sandbox_name(&name)?, "workspace_scope": q.workspace()?.selector() });
    let mut cfg = s.gateways.call_json(&gw, "GetSandboxConfig", request).await?;
    let drop: Vec<_> = cfg.descriptor().fields().filter(|f| !EFFECTIVE_POLICY_FIELDS.contains(&f.name())).collect();
    drop.iter().for_each(|f| cfg.clear_field(f));
    Ok(ProtoJson(cfg))
}

/// Policy revisions without their bodies; fetch one through
/// `GetSandboxPolicyStatus` to see it.
async fn policy_history(
    State(s): State<AppState>,
    Path((gw, name)): Path<(String, String)>,
    Query(q): Query<ScopeQuery>,
) -> ApiResult<ProtoJson> {
    let request = json!({ "sandbox": sandbox_name(&name)?, "workspace_scope": q.workspace()?.selector() });
    let mut res = s.gateways.list_all(&gw, "ListSandboxPolicies", request, "revisions").await?;
    if let Some(prost_reflect::Value::List(revisions)) = res.get_field_by_name_mut("revisions") {
        revisions
            .iter_mut()
            .filter_map(prost_reflect::Value::as_message_mut)
            .for_each(|r| r.clear_field_by_name("policy"));
    }
    Ok(ProtoJson(res))
}

/// Log filters shared by `/logs` and `/watch`.
#[derive(Debug, Default, Deserialize)]
pub struct LogFilter {
    pub source: Option<String>,
    pub level: Option<String>,
    pub since: Option<String>,
}

impl LogFilter {
    /// `(sources, min_level, since_time)` as proto JSON values.
    pub fn to_fields(&self) -> Result<(Value, Value, Option<Value>), ApiError> {
        let sources = match self.source.as_deref().unwrap_or("") {
            "" | "all" => json!([]),
            src @ ("gateway" | "sandbox") => json!([src]),
            _ => return Err(ApiError::bad_request("invalid source")),
        };
        let level = match self.level.as_deref().unwrap_or("") {
            "" => json!(""),
            l @ ("error" | "warn" | "info" | "debug" | "trace") => json!(l),
            _ => return Err(ApiError::bad_request("invalid level")),
        };
        let since = match self.since.as_deref().filter(|s| !s.is_empty()) {
            None => None,
            Some(s) => {
                let d = validate::parse_since(s)
                    .ok_or_else(|| ApiError::bad_request("invalid since (use e.g. 30s, 5m, 1h, 2d)"))?;
                Some(json!(timestamp(SystemTime::now() - d)))
            }
        };
        Ok((sources, level, since))
    }
}

fn timestamp(t: SystemTime) -> String {
    let d = t.duration_since(SystemTime::UNIX_EPOCH).unwrap_or(Duration::ZERO);
    prost_types::Timestamp { seconds: d.as_secs() as i64, nanos: 0 }.to_string()
}

#[derive(Debug, Deserialize)]
struct LogsQuery {
    #[serde(flatten)]
    scope: ScopeQuery,
    #[serde(flatten)]
    filter: LogFilter,
    n: Option<String>,
}

async fn logs(
    State(s): State<AppState>,
    Path((gw, name)): Path<(String, String)>,
    Query(q): Query<LogsQuery>,
) -> ApiResult<ProtoJson> {
    let (sources, min_level, since) = q.filter.to_fields()?;
    let mut request = json!({
        "workspace_scope": q.scope.workspace()?.selector(),
        "sandbox": sandbox_name(&name)?,
        "lines": validate::clamp(q.n.as_deref(), 500, 1, 5000),
        "sources": sources,
        "min_level": min_level,
    });
    if let Some(since) = since {
        request["since_time"] = since;
    }
    s.gateways.call_json(&gw, "GetSandboxLogs", request).await.map(ProtoJson)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_filter_validation() {
        let f = LogFilter { source: Some("sandbox".into()), level: Some("warn".into()), since: Some("5m".into()) };
        let (sources, level, since) = f.to_fields().unwrap();
        assert_eq!(sources, json!(["sandbox"]));
        assert_eq!(level, "warn");
        assert!(since.unwrap().as_str().unwrap().ends_with('Z'));
        assert!(LogFilter { source: Some("x".into()), ..Default::default() }.to_fields().is_err());
        assert!(LogFilter { level: Some("loud".into()), ..Default::default() }.to_fields().is_err());
        assert!(LogFilter { since: Some("forever".into()), ..Default::default() }.to_fields().is_err());
    }
}
