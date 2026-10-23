//! The HTTP application: routes, guards and response headers.

mod assets;
mod calls;
mod files;
pub mod guard;
mod local;
mod proto_json;
mod reads;
mod terminal;
mod watch;

use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{HeaderValue, header},
    middleware,
};
use tower_http::{catch_panic::CatchPanicLayer, set_header::SetResponseHeaderLayer, trace::TraceLayer};

use crate::state::AppState;

const MAX_BODY: usize = 4 << 20;

const CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; \
                   img-src 'self' data:; font-src 'self' data:; connect-src 'self'; \
                   frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

pub fn router(state: AppState) -> Router {
    let headers = [
        (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        (header::X_FRAME_OPTIONS, "DENY"),
        (header::REFERRER_POLICY, "no-referrer"),
        (header::CONTENT_SECURITY_POLICY, CSP),
    ];
    let mut app = Router::new()
        .merge(reads::routes())
        .merge(calls::routes())
        .merge(local::routes())
        .merge(files::routes())
        .merge(terminal::routes())
        .merge(watch::routes())
        .fallback(assets::fallback)
        .layer(middleware::from_fn_with_state(state.clone(), guard::guard))
        .layer(DefaultBodyLimit::max(MAX_BODY))
        .layer(SetResponseHeaderLayer::if_not_present(header::CACHE_CONTROL, HeaderValue::from_static("no-store")))
        .layer(CatchPanicLayer::new())
        .layer(TraceLayer::new_for_http());
    for (name, value) in headers {
        app = app.layer(SetResponseHeaderLayer::overriding(name, HeaderValue::from_static(value)));
    }
    app.with_state(state)
}
