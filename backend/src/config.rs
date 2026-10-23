//! Command-line flags (each also settable through an environment variable).

use std::{net::SocketAddr, path::PathBuf, time::Duration};

use clap::Parser;

#[derive(Debug, Clone, Parser)]
#[command(name = "openshell-console", version, about = "Local web console for OpenShell gateways")]
pub struct Config {
    /// Listen address. Keep it on loopback: the console has no login.
    #[arg(long, env = "OPENSHELL_UI_ADDR", default_value = "127.0.0.1:8787")]
    pub addr: SocketAddr,

    /// Open the UI in the default browser after start.
    #[arg(long)]
    pub open: bool,

    /// Refuse every action that changes state.
    #[arg(long, env = "OPENSHELL_UI_READ_ONLY")]
    pub read_only: bool,

    /// JSON-lines file that records every write action
    /// [default: $XDG_STATE_HOME/openshell-ui/audit.jsonl].
    #[arg(long, env = "OPENSHELL_UI_AUDIT_LOG")]
    pub audit_log: Option<PathBuf>,

    /// Directory with openshell-gateway.{out,err}.log of the local gateway
    /// [default: Homebrew log directory, else the systemd journal].
    #[arg(long, env = "OPENSHELL_UI_GATEWAY_LOG_DIR")]
    pub gateway_log_dir: Option<PathBuf>,

    /// Extra Host header values to accept, e.g. behind a reverse proxy.
    #[arg(long, env = "OPENSHELL_UI_ALLOWED_HOSTS", value_delimiter = ',')]
    pub allowed_host: Vec<String>,

    /// Timeout for one gateway call, in seconds.
    #[arg(long, env = "OPENSHELL_UI_TIMEOUT", default_value_t = 20)]
    pub timeout_secs: u64,
}

impl Config {
    pub fn timeout(&self) -> Duration {
        Duration::from_secs(self.timeout_secs)
    }
}
