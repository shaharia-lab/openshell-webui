//! Command-line flags (each also settable through an environment variable).

use std::{net::SocketAddr, path::PathBuf, time::Duration};

use clap::{ArgAction, Parser, builder::BoolishValueParser};

#[derive(Debug, Clone, Parser)]
#[command(name = "openshell-webui", version, about = "Local web UI for OpenShell gateways")]
pub struct Config {
    /// Listen address. Keep it on loopback: the WebUI has no login.
    #[arg(long, env = "OPENSHELL_UI_ADDR", default_value = "127.0.0.1:8787")]
    pub addr: SocketAddr,

    /// Open the UI in the default browser after start.
    #[arg(long)]
    pub open: bool,

    /// Refuse every action that changes state. The variable takes true/false, 1/0, yes/no or on/off.
    #[arg(long, env = "OPENSHELL_UI_READ_ONLY", action = ArgAction::SetTrue, value_parser = BoolishValueParser::new())]
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

    /// Never ask GitHub for the latest release (the sidebar's update notice).
    #[arg(long, env = "OPENSHELL_UI_NO_UPDATE_CHECK", action = ArgAction::SetTrue, value_parser = BoolishValueParser::new())]
    pub no_update_check: bool,
}

impl Config {
    pub fn timeout(&self) -> Duration {
        Duration::from_secs(self.timeout_secs)
    }
}
