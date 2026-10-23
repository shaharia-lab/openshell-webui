//! Shared application state, built once at startup and cloned into handlers.

use std::{collections::HashSet, net::SocketAddr, ops::Deref, sync::Arc, time::Duration};

use crate::{
    audit::AuditLog,
    gateway::Gateways,
    local::{docker::Docker, gateway_log::LogSource},
};

pub struct Inner {
    pub gateways: Gateways,
    pub audit: AuditLog,
    pub docker: Option<Docker>,
    pub gateway_logs: LogSource,
    pub read_only: bool,
    /// Per-start token every state-changing request must carry.
    pub csrf_token: String,
    /// Host header values the server answers to (DNS-rebinding guard).
    pub allowed_hosts: HashSet<String>,
    /// Timeout for writes, which can take longer than reads (sandbox create).
    pub write_timeout: Duration,
}

#[derive(Clone)]
pub struct AppState(Arc<Inner>);

impl AppState {
    pub fn new(inner: Inner) -> Self {
        Self(Arc::new(inner))
    }
}

impl Deref for AppState {
    type Target = Inner;

    fn deref(&self) -> &Inner {
        &self.0
    }
}

/// The Host values for a listener: its own address plus the loopback
/// spellings of its port, plus any extra values from the command line.
pub fn allowed_hosts(addr: SocketAddr, extra: &[String]) -> HashSet<String> {
    let port = addr.port();
    let mut hosts: HashSet<String> =
        [addr.to_string(), format!("127.0.0.1:{port}"), format!("localhost:{port}"), format!("[::1]:{port}")].into();
    hosts.extend(extra.iter().map(|h| h.trim().to_lowercase()).filter(|h| !h.is_empty()));
    hosts
}

/// A random hex token.
pub fn random_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
