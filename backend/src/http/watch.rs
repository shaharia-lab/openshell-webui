//! Live sandbox updates as Server-Sent Events, backed by `WatchSandbox`:
//! status changes, log lines and platform events. Each `SandboxStreamEvent`
//! is one `data:` line of redacted proto JSON; a gateway error is sent as
//! `event: error` before the stream ends.

use std::{convert::Infallible, time::Duration};

use axum::{
    Router,
    extract::{Path, Query, State},
    response::sse::{Event, KeepAlive, Sse},
    routing::get,
};
use futures::{Stream, StreamExt};
use serde::Deserialize;
use serde_json::json;

use super::{
    proto_json::ProtoJson,
    reads::{LogFilter, ScopeQuery, sandbox_name},
};
use crate::{
    error::{ApiError, ApiResult},
    reflect,
    state::AppState,
    validate,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/gw/{gw}/sandboxes/{name}/watch", get(watch))
}

#[derive(Deserialize)]
struct WatchQuery {
    #[serde(flatten)]
    scope: ScopeQuery,
    #[serde(flatten)]
    filter: LogFilter,
    logs: Option<String>,
    events: Option<String>,
    status: Option<String>,
    tail: Option<String>,
    event_tail: Option<String>,
}

fn flag(v: Option<&str>) -> bool {
    matches!(v, Some("1" | "true"))
}

async fn watch(
    State(s): State<AppState>,
    Path((gw, name)): Path<(String, String)>,
    Query(q): Query<WatchQuery>,
) -> ApiResult<Sse<impl Stream<Item = Result<Event, Infallible>>>> {
    let (sources, min_level, since) = q.filter.to_fields()?;
    let mut request = json!({
        "workspace_scope": q.scope.workspace()?.selector(),
        "sandbox": sandbox_name(&name)?,
        "follow_status": flag(q.status.as_deref()),
        "follow_logs": flag(q.logs.as_deref()),
        "follow_events": flag(q.events.as_deref()),
        "log_tail_lines": validate::clamp(q.tail.as_deref(), 200, 0, 5000),
        "event_tail": validate::clamp(q.event_tail.as_deref(), 50, 0, 1000),
        "log_sources": sources,
        "log_min_level": min_level,
    });
    if let Some(since) = since {
        request["since_time"] = since;
    }
    let method = reflect::method("WatchSandbox")?;
    let request = reflect::from_json(&method.input(), request)?;
    let client = s.gateways.client(&gw)?;
    let events = client.server_streaming(&method, request, s.gateways.timeout()).await.map_err(ApiError::from)?;

    // An error event is delivered, then the stream ends.
    let stream = events
        .map(|item| match item {
            Ok(msg) => (Event::default().data(ProtoJson(msg).into_value().to_string()), false),
            Err(status) => {
                let body = json!({ "error": status.message(), "code": crate::error::code_name(status.code()) });
                (Event::default().event("error").data(body.to_string()), true)
            }
        })
        .scan(false, |stopped, (event, is_error)| {
            let next = if *stopped { None } else { Some(Ok(event)) };
            *stopped |= is_error;
            futures::future::ready(next)
        });
    Ok(Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)).text("ping")))
}
