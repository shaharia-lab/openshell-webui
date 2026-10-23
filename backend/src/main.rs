use clap::Parser;
use openshell_console::config::Config;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();
    let config = Config::parse();
    let (listener, state) = openshell_console::bind(&config).await?;
    let url = format!("http://{}", listener.local_addr()?);
    let mode = if config.read_only { "read-only" } else { "read-write" };
    tracing::info!("OpenShell Console on {url} ({mode}, audit log {})", state.audit.path().display());
    if config.open {
        open_browser(&url);
    }
    openshell_console::serve(listener, state).await
}

fn open_browser(url: &str) {
    let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    if let Err(e) = std::process::Command::new(opener).arg(url).spawn() {
        tracing::warn!("could not open the browser: {e}");
    }
}
