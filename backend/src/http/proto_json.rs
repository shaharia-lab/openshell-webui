//! The response type for gateway messages: redacted proto JSON.

use axum::{
    Json,
    response::{IntoResponse, Response},
};
use prost_reflect::DynamicMessage;

use crate::{redact, reflect};

/// A gateway message, redacted and serialized with proto field names.
pub struct ProtoJson(pub DynamicMessage);

impl ProtoJson {
    pub fn into_value(mut self) -> serde_json::Value {
        redact::redact(&mut self.0);
        reflect::to_json(&self.0)
    }
}

impl IntoResponse for ProtoJson {
    fn into_response(self) -> Response {
        Json(self.into_value()).into_response()
    }
}
