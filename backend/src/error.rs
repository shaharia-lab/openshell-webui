//! The API error type. Every handler returns `Result<_, ApiError>`, which
//! renders as `{"error": "...", "code": "..."}` with a matching HTTP status.

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use tonic::Code;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
    /// gRPC status code name, set when the error came from a gateway.
    pub grpc_code: Option<&'static str>,
}

pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self { status, message: message.into(), grpc_code: None }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, message)
    }

    pub fn read_only() -> Self {
        Self::forbidden("the console runs in read-only mode")
    }
}

impl From<tonic::Status> for ApiError {
    fn from(s: tonic::Status) -> Self {
        Self { status: http_status(s.code()), message: s.message().to_owned(), grpc_code: Some(code_name(s.code())) }
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ApiError {}

#[derive(Serialize)]
struct Body<'a> {
    error: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<&'a str>,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Body { error: &self.message, code: self.grpc_code };
        (self.status, Json(body)).into_response()
    }
}

/// Maps a gRPC status to the closest HTTP status; anything unmapped is a
/// gateway failure (502).
pub fn http_status(code: Code) -> StatusCode {
    match code {
        Code::InvalidArgument | Code::FailedPrecondition | Code::OutOfRange => StatusCode::BAD_REQUEST,
        Code::NotFound => StatusCode::NOT_FOUND,
        Code::AlreadyExists | Code::Aborted => StatusCode::CONFLICT,
        Code::PermissionDenied => StatusCode::FORBIDDEN,
        Code::Unauthenticated => StatusCode::UNAUTHORIZED,
        Code::ResourceExhausted => StatusCode::TOO_MANY_REQUESTS,
        Code::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
        Code::DeadlineExceeded => StatusCode::GATEWAY_TIMEOUT,
        Code::Unimplemented => StatusCode::NOT_IMPLEMENTED,
        _ => StatusCode::BAD_GATEWAY,
    }
}

/// The canonical gRPC code name, as the gateway and the Go server report it.
pub fn code_name(code: Code) -> &'static str {
    match code {
        Code::Ok => "OK",
        Code::Cancelled => "Canceled",
        Code::Unknown => "Unknown",
        Code::InvalidArgument => "InvalidArgument",
        Code::DeadlineExceeded => "DeadlineExceeded",
        Code::NotFound => "NotFound",
        Code::AlreadyExists => "AlreadyExists",
        Code::PermissionDenied => "PermissionDenied",
        Code::ResourceExhausted => "ResourceExhausted",
        Code::FailedPrecondition => "FailedPrecondition",
        Code::Aborted => "Aborted",
        Code::OutOfRange => "OutOfRange",
        Code::Unimplemented => "Unimplemented",
        Code::Internal => "Internal",
        Code::Unavailable => "Unavailable",
        Code::DataLoss => "DataLoss",
        Code::Unauthenticated => "Unauthenticated",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grpc_status_maps_to_http_and_keeps_code_name() {
        let e = ApiError::from(tonic::Status::not_found("no sandbox"));
        assert_eq!(e.status, StatusCode::NOT_FOUND);
        assert_eq!(e.grpc_code, Some("NotFound"));
        assert_eq!(e.message, "no sandbox");
        assert_eq!(http_status(Code::Internal), StatusCode::BAD_GATEWAY);
    }
}
