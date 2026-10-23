//! Append-only JSON-lines record of every write the WebUI performs. It
//! records what was acted on and the result, never credentials or policy
//! bodies.

use std::{
    collections::BTreeMap,
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use prost_reflect::{DynamicMessage, Kind, Value};
use serde::Serialize;

use crate::{error::ApiError, files};

/// Request fields that identify what a call acts on. Other fields are never
/// written to the log.
const TARGET_FIELDS: &[&str] = &[
    "name",
    "sandbox",
    "provider",
    "chunk_id",
    "principal_subject",
    "id",
    "credential_key",
    "setting_key",
    "target_port",
    "global",
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Entry {
    pub time: String,
    pub gateway: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub workspace: String,
    pub method: String,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub target: BTreeMap<String, String>,
    pub result: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Entry {
    /// An entry for a gateway call; the target is taken from the request.
    pub fn new(
        gateway: &str,
        workspace: &str,
        method: &str,
        request: &DynamicMessage,
        outcome: Result<(), &ApiError>,
    ) -> Self {
        Self::with_target(gateway, workspace, method, target(request), outcome)
    }

    /// An entry for an action that is not a single gateway call.
    pub fn with_target(
        gateway: &str,
        workspace: &str,
        method: &str,
        target: BTreeMap<String, String>,
        outcome: Result<(), &ApiError>,
    ) -> Self {
        let (result, error) = match outcome {
            Ok(()) => ("ok".to_owned(), None),
            Err(e) => (e.grpc_code.unwrap_or("Error").to_owned(), Some(e.message.clone())),
        };
        Self {
            time: now_rfc3339(),
            gateway: gateway.into(),
            workspace: workspace.into(),
            method: method.into(),
            target,
            result,
            error,
        }
    }
}

#[derive(Clone)]
pub struct AuditLog {
    path: PathBuf,
    lock: Arc<Mutex<()>>,
}

impl AuditLog {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into(), lock: Arc::default() }
    }

    /// `$XDG_STATE_HOME/openshell-ui/audit.jsonl`, by default under
    /// `~/.local/state`.
    pub fn default_path() -> PathBuf {
        std::env::var_os("XDG_STATE_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::home_dir().map(|h| h.join(".local/state")))
            .unwrap_or_default()
            .join("openshell-ui/audit.jsonl")
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Appends one entry. Failures are logged, not returned: an unwritable
    /// audit log must not hide the outcome of a call that already happened.
    pub fn record(&self, entry: &Entry) {
        let _guard = self.lock.lock().expect("audit lock poisoned");
        if let Err(e) = self.append(entry) {
            tracing::error!(path = %self.path.display(), "audit log: {e}");
        }
    }

    fn append(&self, entry: &Entry) -> std::io::Result<()> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let mut opts = std::fs::OpenOptions::new();
        opts.create(true).append(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut opts, 0o600);
        let mut line = serde_json::to_vec(entry)?;
        line.push(b'\n');
        opts.open(&self.path)?.write_all(&line)
    }

    /// The last `n` entries, oldest first.
    pub fn tail(&self, n: usize) -> Vec<serde_json::Value> {
        let raw = files::tail(&self.path, 1 << 20).unwrap_or_default();
        let entries: Vec<serde_json::Value> =
            String::from_utf8_lossy(&raw).lines().filter_map(|l| serde_json::from_str(l).ok()).collect();
        entries[entries.len().saturating_sub(n)..].to_vec()
    }
}

/// The identifying fields of a request: allowlisted scalars, the metadata
/// name of nested resources, and counts instead of bodies.
fn target(msg: &DynamicMessage) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for (field, value) in msg.fields() {
        let name = field.name();
        match value {
            Value::List(items) if name == "merge_operations" && !items.is_empty() => {
                out.insert(name.to_owned(), items.len().to_string());
            }
            Value::Message(_) if name == "policy" => {
                out.insert(name.to_owned(), "replaced".to_owned());
            }
            Value::Message(nested) => {
                if let Some(meta) = nested.get_field_by_name("metadata")
                    && let Some(n) = meta.as_message().and_then(|m| m.get_field_by_name("name"))
                    && let Some(s) = n.as_str()
                {
                    out.insert(format!("{name}.name"), s.to_owned());
                }
            }
            Value::List(_) | Value::Map(_) => {}
            _ if TARGET_FIELDS.contains(&name) && !matches!(field.kind(), Kind::Message(_)) => {
                out.insert(name.to_owned(), scalar(value));
            }
            _ => {}
        }
    }
    out
}

fn scalar(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::I32(n) | Value::EnumNumber(n) => n.to_string(),
        Value::I64(n) => n.to_string(),
        Value::U32(n) => n.to_string(),
        Value::U64(n) => n.to_string(),
        other => format!("{other:?}"),
    }
}

fn now_rfc3339() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let ts = prost_types::Timestamp { seconds: secs as i64, nanos: 0 };
    ts.to_string()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::reflect::{from_json, method};

    fn req(name: &str, body: serde_json::Value) -> DynamicMessage {
        from_json(&method(name).unwrap().input(), body).unwrap()
    }

    #[test]
    fn target_keeps_identifiers_and_drops_bodies() {
        let r = req(
            "CreateProvider",
            json!({"provider": {"metadata": {"name": "claude"}, "type": "x", "credentials": {"TOKEN": "secret"}}}),
        );
        assert_eq!(target(&r), BTreeMap::from([("provider.name".into(), "claude".into())]));

        let r = req("UpdateConfig", json!({"sandbox": "demo", "policy": {"version": 1}, "global": false}));
        let t = target(&r);
        assert_eq!(t["sandbox"], "demo");
        assert_eq!(t["policy"], "replaced");
    }

    #[test]
    fn records_and_tails_entries() {
        let tmp = tempfile::tempdir().unwrap();
        let log = AuditLog::new(tmp.path().join("a/audit.jsonl"));
        let r = req("DeleteSandbox", json!({"name": "demo"}));
        log.record(&Entry::new("gw", "default", "DeleteSandbox", &r, Ok(())));
        let err = ApiError::from(tonic::Status::permission_denied("no"));
        log.record(&Entry::new("gw", "", "DeleteSandbox", &r, Err(&err)));

        let tail = log.tail(10);
        assert_eq!(tail.len(), 2);
        assert_eq!(tail[0]["target"]["name"], "demo");
        assert_eq!(tail[1]["result"], "PermissionDenied");
        assert_eq!(log.tail(1).len(), 1);
        assert!(tail[0]["time"].as_str().unwrap().ends_with('Z'));
    }
}
