//! Request guards: DNS-rebinding protection (Host allowlist), cross-site
//! refusal for the API, and Origin + CSRF token on every state-changing
//! request and WebSocket upgrade.

use axum::{
    extract::{Request, State},
    http::{HeaderMap, Method, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use subtle::ConstantTimeEq;

use crate::{error::ApiError, state::AppState};

pub const CSRF_HEADER: &str = "x-csrf-token";

pub async fn guard(State(state): State<AppState>, req: Request, next: Next) -> Response {
    match check(&state, &req) {
        Ok(()) => next.run(req).await,
        Err(e) => e.into_response(),
    }
}

fn check(state: &AppState, req: &Request) -> Result<(), ApiError> {
    let headers = req.headers();
    let host = header_str(headers, header::HOST.as_str()).to_lowercase();
    if !state.allowed_hosts.contains(&host) {
        return Err(ApiError::new(axum::http::StatusCode::MISDIRECTED_REQUEST, "unexpected Host header"));
    }

    // Pages may be opened from links on other sites; API calls may not.
    let site = header_str(headers, "sec-fetch-site");
    if req.uri().path().starts_with("/api/") && !matches!(site, "" | "same-origin" | "none") {
        return Err(ApiError::forbidden("cross-site request refused"));
    }

    let unsafe_method = !matches!(*req.method(), Method::GET | Method::HEAD);
    let upgrade = header_str(headers, header::UPGRADE.as_str()).eq_ignore_ascii_case("websocket");
    if unsafe_method || upgrade {
        // Either scheme: a reverse proxy may terminate TLS in front of the WebUI.
        let origin = header_str(headers, header::ORIGIN.as_str());
        if origin != format!("http://{host}") && origin != format!("https://{host}") {
            return Err(ApiError::forbidden("missing or foreign Origin"));
        }
        let token = if upgrade { query_param(req, "csrf") } else { header_str(headers, CSRF_HEADER).to_owned() };
        if !bool::from(token.as_bytes().ct_eq(state.csrf_token.as_bytes())) {
            return Err(ApiError::forbidden("missing or invalid CSRF token"));
        }
    }
    Ok(())
}

fn header_str<'a>(headers: &'a HeaderMap, name: &str) -> &'a str {
    headers.get(name).and_then(|v| v.to_str().ok()).unwrap_or("")
}

fn query_param(req: &Request, key: &str) -> String {
    url::form_urlencoded::parse(req.uri().query().unwrap_or("").as_bytes())
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.into_owned())
        .unwrap_or_default()
}
