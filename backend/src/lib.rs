//! OpenShell WebUI backend: a local web UI for OpenShell gateways.
//!
//! It reads the gateways registered in the OpenShell CLI, talks to them over
//! gRPC with the CLI's credentials, and exposes a small JSON/WebSocket/SSE API
//! to the browser with secret redaction, an allowlist of callable methods,
//! request guards and an audit log.

pub mod audit;
pub mod config;
pub mod convert;
pub mod error;
pub mod exec;
pub mod files;
pub mod gateway;
pub mod http;
pub mod local;
pub mod proto;
pub mod redact;
pub mod reflect;
pub mod rpcs;
pub mod sandbox_fs;
pub mod state;
pub mod validate;
pub mod workspace;

use std::time::Duration;

use tokio::net::TcpListener;

use crate::{
    audit::AuditLog,
    config::Config,
    gateway::{Gateways, Registry},
    local::{docker::Docker, gateway_log::LogSource},
    state::{AppState, Inner},
};

/// Writes such as sandbox creation can take longer than reads.
const WRITE_TIMEOUT: Duration = Duration::from_secs(60);

/// Binds the listener and builds the state for `config`.
pub async fn bind(config: &Config) -> anyhow::Result<(TcpListener, AppState)> {
    let listener = TcpListener::bind(config.addr).await?;
    let addr = listener.local_addr()?;
    let registry = Registry::from_env();
    let docker = Docker::detect(registry.dir());
    if docker.is_none() {
        tracing::warn!("docker CLI not found; local container stats are disabled");
    }
    let state = AppState::new(Inner {
        gateway_logs: LogSource::detect(config.gateway_log_dir.clone()).await,
        audit: AuditLog::new(config.audit_log.clone().unwrap_or_else(AuditLog::default_path)),
        gateways: Gateways::new(registry, config.timeout()),
        docker,
        read_only: config.read_only,
        csrf_token: state::random_token(),
        allowed_hosts: state::allowed_hosts(addr, &config.allowed_host),
        write_timeout: WRITE_TIMEOUT.max(config.timeout()),
    });
    Ok((listener, state))
}

/// Serves until Ctrl+C or SIGTERM.
pub async fn serve(listener: TcpListener, state: AppState) -> anyhow::Result<()> {
    axum::serve(listener, http::router(state)).with_graceful_shutdown(shutdown()).await?;
    Ok(())
}

async fn shutdown() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let term = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! { () = ctrl_c => {}, () = term => {} }
}
