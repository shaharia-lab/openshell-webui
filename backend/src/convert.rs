//! Turns policy and provider-profile documents into protos.
//!
//! Accepts the CLI YAML format (as in `openshell policy set --policy` and
//! `openshell provider profile import`), proto-shaped YAML, and proto JSON.
//! Only the known spelling differences between the CLI format and the proto
//! are rewritten; unknown fields are errors, so a document is never guessed
//! at. The gateway validates the result again before accepting it.

use prost_reflect::DynamicMessage;
use serde_json::{Map, Value};

use crate::{
    error::ApiError,
    reflect::{from_json, message},
};

pub const POLICY: &str = "openshell.sandbox.v1.SandboxPolicy";
pub const PROFILE: &str = "openshell.v1.ProviderProfile";

/// Parses a sandbox policy document.
pub fn policy(text: &str) -> Result<DynamicMessage, ApiError> {
    let mut doc = decode(text)?;
    if let Some(fs) = doc.remove("filesystem_policy") {
        if doc.contains_key("filesystem") {
            return Err(ApiError::bad_request("use either filesystem_policy or filesystem, not both"));
        }
        doc.insert("filesystem".into(), fs);
    }
    if let Some(Value::Object(rules)) = doc.get_mut("network_policies") {
        for (name, rule) in rules.iter_mut() {
            let Value::Object(rule) = rule else { continue };
            rule.entry("name").or_insert_with(|| Value::String(name.clone()));
            normalize_endpoints(rule.get_mut("endpoints"));
            normalize_binaries(rule);
        }
    }
    parse(POLICY, doc, "policy")
}

/// Parses a provider profile document.
pub fn profile(text: &str) -> Result<DynamicMessage, ApiError> {
    let mut doc = decode(text)?;
    prefix_enum(&mut doc, "category", "PROVIDER_PROFILE_CATEGORY_");
    normalize_endpoints(doc.get_mut("endpoints"));
    normalize_binaries(&mut doc);
    parse(PROFILE, doc, "profile")
}

fn decode(text: &str) -> Result<Map<String, Value>, ApiError> {
    // YAML is a superset of JSON, so one decoder handles both.
    match serde_norway::from_str::<Value>(text) {
        Ok(Value::Object(doc)) => Ok(doc),
        Ok(Value::Null) => Err(ApiError::bad_request("document is empty")),
        Ok(_) => Err(ApiError::bad_request("document must be a mapping")),
        Err(e) => Err(ApiError::bad_request(format!("parse document: {e}"))),
    }
}

fn parse(full_name: &str, doc: Map<String, Value>, what: &str) -> Result<DynamicMessage, ApiError> {
    from_json(&message(full_name), Value::Object(doc))
        .map_err(|e| ApiError::bad_request(format!("{what}: {}", e.message)))
}

/// Maps CLI enum spellings (`enforce`, `read-write`, `skip`) to proto names.
fn normalize_endpoints(endpoints: Option<&mut Value>) {
    let Some(Value::Array(endpoints)) = endpoints else { return };
    for ep in endpoints.iter_mut().filter_map(Value::as_object_mut) {
        prefix_enum(ep, "access", "NETWORK_ACCESS_PRESET_");
        prefix_enum(ep, "enforcement", "NETWORK_ENFORCEMENT_MODE_");
        prefix_enum(ep, "tls", "NETWORK_TLS_MODE_");
    }
}

fn prefix_enum(m: &mut Map<String, Value>, key: &str, prefix: &str) {
    match m.get(key) {
        Some(Value::String(s)) if s.is_empty() => {
            m.remove(key);
        }
        Some(Value::String(s)) if !s.starts_with(prefix) => {
            let v = format!("{prefix}{}", s.replace('-', "_").to_uppercase());
            m.insert(key.into(), Value::String(v));
        }
        _ => {}
    }
}

/// Accepts `binaries: [/usr/bin/x]` as well as `binaries: [{path: /usr/bin/x}]`.
fn normalize_binaries(m: &mut Map<String, Value>) {
    let Some(Value::Array(list)) = m.get_mut("binaries") else { return };
    for b in list.iter_mut() {
        if let Value::String(path) = b {
            *b = serde_json::json!({ "path": path });
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::reflect::to_json;

    const CLI_POLICY: &str = r#"
version: 1
filesystem_policy:
  include_workdir: true
  read_only: [/usr, /etc]
  read_write: [/tmp]
landlock:
  compatibility: best_effort
network_policies:
  claude:
    endpoints:
      - { host: api.anthropic.com, port: 443, protocol: rest, enforcement: enforce, access: read-write }
    binaries:
      - /usr/local/bin/claude
"#;

    #[test]
    fn cli_policy_converts_to_proto() {
        let out = to_json(&policy(CLI_POLICY).unwrap());
        assert_eq!(out["filesystem"]["read_only"], json!(["/usr", "/etc"]));
        let rule = &out["network_policies"]["claude"];
        assert_eq!(rule["name"], "claude");
        assert_eq!(rule["endpoints"][0]["access"], "NETWORK_ACCESS_PRESET_READ_WRITE");
        assert_eq!(rule["endpoints"][0]["enforcement"], "NETWORK_ENFORCEMENT_MODE_ENFORCE");
        assert_eq!(rule["binaries"][0]["path"], "/usr/local/bin/claude");
    }

    #[test]
    fn proto_json_is_accepted_and_unknown_fields_rejected() {
        assert!(policy(r#"{"version": 1, "filesystem": {"read_only": ["/usr"]}}"#).is_ok());
        assert!(policy("version: 1\nbogus: true").unwrap_err().message.contains("policy"));
        assert!(policy("filesystem_policy: {}\nfilesystem: {}").is_err());
        assert!(policy("").is_err());
        assert!(policy("- a list").is_err());
    }

    #[test]
    fn cli_profile_converts_to_proto() {
        let doc = r#"
id: claude-code-oauth
display_name: Claude Code
category: agent
credentials:
  - name: oauth_token
    env_vars: [CLAUDE_CODE_OAUTH_TOKEN]
    required: true
endpoints:
  - { host: api.anthropic.com, port: 443, protocol: rest, access: read-write, enforcement: enforce }
binaries: [/usr/local/bin/claude]
"#;
        let out = to_json(&profile(doc).unwrap());
        assert_eq!(out["category"], "PROVIDER_PROFILE_CATEGORY_AGENT");
        assert_eq!(out["endpoints"][0]["access"], "NETWORK_ACCESS_PRESET_READ_WRITE");
        assert_eq!(out["binaries"][0]["path"], "/usr/local/bin/claude");
    }
}
