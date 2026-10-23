//! Endpoints for data from this machine: Docker containers and the local
//! gateway's logs.

use axum::{
    Json, Router,
    extract::{Query, State},
    http::StatusCode,
    routing::get,
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    error::{ApiError, ApiResult},
    local::docker::Container,
    state::AppState,
    validate,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/local/containers", get(containers)).route("/api/local/gateway-log", get(gateway_log))
}

async fn containers(State(s): State<AppState>) -> ApiResult<Json<Vec<Container>>> {
    let docker =
        s.docker.as_ref().ok_or_else(|| ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "docker CLI not available"))?;
    docker.containers().await.map(Json).map_err(|e| ApiError::new(StatusCode::BAD_GATEWAY, e))
}

#[derive(Deserialize)]
struct LogQuery {
    n: Option<String>,
}

async fn gateway_log(State(s): State<AppState>, Query(q): Query<LogQuery>) -> Json<Value> {
    let n = validate::clamp(q.n.as_deref(), 300, 1, 5000) as usize;
    let lines = s.gateway_logs.tail(n).await;
    Json(json!({ "dir": s.gateway_logs.describe(), "lines": lines }))
}
