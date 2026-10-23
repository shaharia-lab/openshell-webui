//! Serves the compiled frontend. With the `embed-frontend` feature the files
//! of `frontend/dist` are compiled into the binary and any non-API path that
//! is not a file gets `index.html`, so client-side routes work on reload.
//! Without it, the backend only serves the API and points to the dev server.

use axum::{
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
};

use crate::error::ApiError;

pub async fn fallback(uri: Uri) -> Response {
    if uri.path().starts_with("/api/") {
        return ApiError::not_found(format!("no API route {}", uri.path())).into_response();
    }
    serve(uri.path().trim_start_matches('/'))
}

#[cfg(feature = "embed-frontend")]
fn serve(path: &str) -> Response {
    use axum::http::header;

    #[derive(rust_embed::Embed)]
    #[folder = "../frontend/dist"]
    struct Dist;

    let (path, file) = match Dist::get(path) {
        Some(file) if !path.is_empty() => (path, file),
        // A missing file is a 404; only route-like paths get the app shell.
        _ if !is_client_route(path) => return (StatusCode::NOT_FOUND, "not found").into_response(),
        _ => match Dist::get("index.html") {
            Some(index) => ("index.html", index),
            None => return (StatusCode::NOT_FOUND, "frontend build is empty").into_response(),
        },
    };
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    // Vite fingerprints everything under assets/, so it can be cached for good.
    let cache = if path.starts_with("assets/") { "public, max-age=31536000, immutable" } else { "no-cache" };
    ([(header::CONTENT_TYPE, mime.as_ref()), (header::CACHE_CONTROL, cache)], file.data).into_response()
}

/// Client-side routes have no file extension and live outside `assets/`.
#[cfg_attr(not(feature = "embed-frontend"), allow(dead_code))]
fn is_client_route(path: &str) -> bool {
    !path.starts_with("assets/") && !path.rsplit('/').next().unwrap_or_default().contains('.')
}

#[cfg(not(feature = "embed-frontend"))]
fn serve(_path: &str) -> Response {
    use axum::response::Html;
    (
        StatusCode::NOT_FOUND,
        Html(
            "<!doctype html><title>OpenShell Console API</title>\
             <p>This build serves the API only. Run <code>make frontend-dev</code> and open the Vite dev server, \
             or build with <code>make build</code> to embed the UI.</p>",
        ),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::is_client_route;

    #[test]
    fn only_route_like_paths_fall_back_to_the_app() {
        assert!(is_client_route(""));
        assert!(is_client_route("sandboxes/default/demo/files"));
        assert!(!is_client_route("assets/index-abc.js"));
        assert!(!is_client_route("favicon.ico"));
        assert!(!is_client_route("assets/fonts/x"));
    }
}
