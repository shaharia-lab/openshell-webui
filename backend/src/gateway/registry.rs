//! Reads the OpenShell CLI gateway registry:
//! `$XDG_CONFIG_HOME/openshell/gateways/<name>/metadata.json` plus the
//! `active_gateway` file (or `$OPENSHELL_GATEWAY`).

use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::error::ApiError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMode {
    Mtls,
    Oidc,
    Plaintext,
    CloudflareJwt,
}

/// One entry of the CLI gateway registry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Gateway {
    pub name: String,
    pub endpoint: String,
    pub auth_mode: AuthMode,
    pub is_remote: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote_host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oidc_issuer: Option<String>,
    pub active: bool,
    /// True when the endpoint is on this machine, so local-only data (service
    /// logs, Docker stats) belongs to this gateway.
    pub local: bool,
    /// The gateway's CLI config directory (credentials live here).
    #[serde(skip)]
    pub dir: PathBuf,
}

#[derive(Deserialize)]
struct Metadata {
    #[serde(default)]
    name: String,
    gateway_endpoint: String,
    #[serde(default)]
    is_remote: bool,
    remote_host: Option<String>,
    auth_mode: Option<AuthMode>,
    oidc_issuer: Option<String>,
}

/// The CLI config directory and the gateways registered in it.
#[derive(Debug, Clone)]
pub struct Registry {
    dir: PathBuf,
}

impl Registry {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    /// The registry the CLI uses: `$XDG_CONFIG_HOME/openshell`, by default
    /// `~/.config/openshell`.
    pub fn from_env() -> Self {
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::home_dir().map(|h| h.join(".config")))
            .unwrap_or_else(|| PathBuf::from(".config"));
        Self::new(base.join("openshell"))
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// All registered gateways, the active one first, then by name.
    pub fn list(&self) -> Result<Vec<Gateway>, ApiError> {
        let entries = match fs::read_dir(self.dir.join("gateways")) {
            Ok(e) => e,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(ApiError::internal(format!("read gateway registry: {e}"))),
        };
        let active = self.active_name();
        let mut out: Vec<Gateway> = entries
            .filter_map(Result::ok)
            .filter(|e| e.path().is_dir() && is_gateway_name(&e.file_name().to_string_lossy()))
            .filter_map(|e| load(&e.path()).ok())
            .map(|mut g| {
                g.active = active.as_deref() == Some(g.name.as_str());
                g
            })
            .collect();
        out.sort_by(|a, b| b.active.cmp(&a.active).then_with(|| a.name.cmp(&b.name)));
        Ok(out)
    }

    /// One registered gateway by name.
    pub fn get(&self, name: &str) -> Result<Gateway, ApiError> {
        if !is_gateway_name(name) {
            return Err(ApiError::bad_request(format!("invalid gateway name {name:?}")));
        }
        self.list()?.into_iter().find(|g| g.name == name).ok_or_else(|| {
            ApiError::not_found(format!("gateway {name:?} is not registered; add it with `openshell gateway add`"))
        })
    }

    fn active_name(&self) -> Option<String> {
        if let Some(v) = std::env::var("OPENSHELL_GATEWAY").ok().filter(|v| !v.trim().is_empty()) {
            return Some(v.trim().to_owned());
        }
        fs::read_to_string(self.dir.join("active_gateway")).ok().map(|s| s.trim().to_owned())
    }
}

fn is_gateway_name(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}

fn load(dir: &Path) -> Result<Gateway, Box<dyn std::error::Error>> {
    let meta: Metadata = serde_json::from_slice(&fs::read(dir.join("metadata.json"))?)?;
    let name = if meta.name.is_empty() {
        dir.file_name().unwrap_or_default().to_string_lossy().into_owned()
    } else {
        meta.name
    };
    let mut auth_mode = meta.auth_mode.unwrap_or(AuthMode::Mtls);
    if meta.gateway_endpoint.starts_with("http://") && auth_mode == AuthMode::Mtls {
        auth_mode = AuthMode::Plaintext;
    }
    let host = url::Url::parse(&meta.gateway_endpoint).ok().and_then(|u| u.host_str().map(str::to_owned));
    let is_loopback = matches!(host.as_deref(), Some("localhost" | "127.0.0.1" | "[::1]" | "::1"));
    Ok(Gateway {
        name,
        endpoint: meta.gateway_endpoint,
        auth_mode,
        is_remote: meta.is_remote,
        remote_host: meta.remote_host,
        oidc_issuer: meta.oidc_issuer,
        active: false,
        local: is_loopback && !meta.is_remote,
        dir: dir.to_path_buf(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn add(root: &Path, name: &str, meta: &str) {
        let dir = root.join("gateways").join(name);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("metadata.json"), meta).unwrap();
    }

    #[test]
    fn lists_gateways_active_first() {
        let tmp = tempfile::tempdir().unwrap();
        add(tmp.path(), "b-local", r#"{"name":"b-local","gateway_endpoint":"https://127.0.0.1:17670"}"#);
        add(
            tmp.path(),
            "a-remote",
            r#"{"gateway_endpoint":"https://gw.example.com","auth_mode":"oidc","is_remote":true}"#,
        );
        add(tmp.path(), "plain", r#"{"gateway_endpoint":"http://localhost:8080"}"#);
        add(tmp.path(), "broken", "not json");
        fs::write(tmp.path().join("active_gateway"), "b-local\n").unwrap();

        let gws = Registry::new(tmp.path()).list().unwrap();
        let names: Vec<_> = gws.iter().map(|g| g.name.as_str()).collect();
        assert_eq!(names, ["b-local", "a-remote", "plain"]);
        assert!(gws[0].active && gws[0].local);
        assert_eq!(gws[0].auth_mode, AuthMode::Mtls);
        assert_eq!(gws[1].auth_mode, AuthMode::Oidc);
        assert!(!gws[1].local);
        assert_eq!(gws[2].auth_mode, AuthMode::Plaintext);
    }

    #[test]
    fn missing_registry_is_empty_and_unknown_gateway_is_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let reg = Registry::new(tmp.path());
        assert!(reg.list().unwrap().is_empty());
        assert_eq!(reg.get("nope").unwrap_err().status, axum::http::StatusCode::NOT_FOUND);
        assert_eq!(reg.get("../x").unwrap_err().status, axum::http::StatusCode::BAD_REQUEST);
    }
}
