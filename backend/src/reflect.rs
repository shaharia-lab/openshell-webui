//! Reflection helpers over the OpenShell descriptor pool: method lookup,
//! proto JSON in and out, and the request fields the backend fills in.

use std::sync::LazyLock;

use prost_reflect::{
    DeserializeOptions, DynamicMessage, Kind, MessageDescriptor, MethodDescriptor, ReflectMessage, SerializeOptions,
    ServiceDescriptor, Value,
};

use crate::{
    error::ApiError,
    proto::{POOL, SERVICE},
};

static SERVICE_DESC: LazyLock<ServiceDescriptor> =
    LazyLock::new(|| POOL.get_service_by_name(SERVICE).expect("gateway service is in the descriptor pool"));

/// A method of the gateway service by its short name, e.g. `ListSandboxes`.
pub fn method(name: &str) -> Result<MethodDescriptor, ApiError> {
    SERVICE_DESC
        .methods()
        .find(|m| m.name() == name)
        .ok_or_else(|| ApiError::not_found(format!("unknown gateway method {name}")))
}

/// A message type by its full name, e.g. `openshell.sandbox.v1.SandboxPolicy`.
pub fn message(full_name: &str) -> MessageDescriptor {
    POOL.get_message_by_name(full_name).unwrap_or_else(|| panic!("{full_name} is in the descriptor pool"))
}

/// Parses proto JSON (proto or JSON field names) into a message. Unknown
/// fields are errors, as with Go's protojson.
pub fn from_json(desc: &MessageDescriptor, json: serde_json::Value) -> Result<DynamicMessage, ApiError> {
    DynamicMessage::deserialize_with_options(desc.clone(), json, &DeserializeOptions::new())
        .map_err(|e| ApiError::bad_request(format!("invalid {}: {e}", desc.name())))
}

/// Serializes a message as proto JSON with proto field names.
pub fn to_json(msg: &DynamicMessage) -> serde_json::Value {
    msg.serialize_with_options(serde_json::value::Serializer, &SerializeOptions::new().use_proto_field_name(true))
        .expect("a dynamic message always serializes to JSON")
}

/// Converts a generated message into a dynamic one of the same type.
pub fn to_dynamic<M: prost::Message>(msg: &M, full_name: &str) -> DynamicMessage {
    DynamicMessage::decode(message(full_name), msg.encode_to_vec().as_slice())
        .expect("a generated message decodes as its own descriptor")
}

/// A string field's value, or empty when unset or absent.
pub fn string_field(msg: &DynamicMessage, name: &str) -> String {
    match msg.get_field_by_name(name).as_deref() {
        Some(Value::String(s)) => s.clone(),
        _ => String::new(),
    }
}

fn bool_field(msg: &DynamicMessage, name: &str) -> bool {
    matches!(msg.get_field_by_name(name).as_deref(), Some(Value::Bool(true)))
}

/// Sets `workspace_scope` when the request has one. Requests with
/// `global: true` act on the gateway as a whole and must not carry a scope.
pub fn set_workspace(msg: &mut DynamicMessage, selector: serde_json::Value) -> Result<(), ApiError> {
    let Some(field) = msg.descriptor().get_field_by_name("workspace_scope") else {
        return Ok(());
    };
    if bool_field(msg, "global") {
        msg.clear_field(&field);
        return Ok(());
    }
    if let Kind::Message(desc) = field.kind() {
        msg.set_field(&field, Value::Message(from_json(&desc, selector)?));
    }
    Ok(())
}

/// Removes `workspace_scope`, for requests that act at platform scope.
pub fn clear_workspace(msg: &mut DynamicMessage) {
    if let Some(field) = msg.descriptor().get_field_by_name("workspace_scope") {
        msg.clear_field(&field);
    }
}

/// Clears `request_id`. The gateway keeps every request ID for 24 hours, at
/// most 1000 per caller, and refuses the caller's ID-carrying writes beyond
/// that. The WebUI never retries with the same ID, so it sends none, like the
/// CLI.
pub fn clear_request_id(msg: &mut DynamicMessage) {
    msg.clear_field_by_name("request_id");
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn json_round_trip_uses_proto_names_and_rejects_unknown_fields() {
        let m = method("ListSandboxes").unwrap();
        let req = from_json(&m.input(), json!({"workspace_scope": {"workspace": "default"}, "pageSize": 5})).unwrap();
        assert_eq!(to_json(&req), json!({"workspace_scope": {"workspace": "default"}, "page_size": 5}));
        assert!(from_json(&m.input(), json!({"nope": 1})).is_err());
        assert!(method("NoSuchMethod").is_err());
    }

    #[test]
    fn workspace_is_filled_and_request_id_cleared() {
        let m = method("CreateSandbox").unwrap();
        let mut req = from_json(&m.input(), json!({"request_id": "3f1c6c2e-0000-4000-8000-000000000000"})).unwrap();
        set_workspace(&mut req, json!({"workspace": "team"})).unwrap();
        clear_request_id(&mut req);
        let out = to_json(&req);
        assert_eq!(out["workspace_scope"], json!({"workspace": "team"}));
        assert!(out.get("request_id").is_none());
    }

    #[test]
    fn clear_workspace_removes_a_scope_from_the_body() {
        let m = method("ImportProviderProfiles").unwrap();
        let mut req = from_json(&m.input(), json!({"workspace_scope": {"workspace": "team"}})).unwrap();
        clear_workspace(&mut req);
        assert!(to_json(&req).get("workspace_scope").is_none());
    }

    #[test]
    fn global_requests_have_no_workspace_scope() {
        let m = method("UpdateConfig").unwrap();
        let mut req = from_json(&m.input(), json!({"global": true, "setting_key": "k"})).unwrap();
        set_workspace(&mut req, json!({"workspace": "team"})).unwrap();
        assert!(to_json(&req).get("workspace_scope").is_none());
    }
}
