//! What the sidebar shows about the WebUI itself: its version, the version of
//! the OpenShell CLI on this machine, and whether a newer release exists.

use std::{cmp::Ordering, time::Duration};

use serde::{Deserialize, Serialize};
use tokio::{sync::Mutex, time::Instant};

use crate::local::command;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const REPOSITORY: &str = "https://github.com/shaharia-lab/openshell-webui";
pub const LATEST_RELEASE_URL: &str = "https://api.github.com/repos/shaharia-lab/openshell-webui/releases/latest";

/// GitHub allows 60 unauthenticated requests an hour per IP; one every few
/// hours per running WebUI stays far below that.
const RELEASE_TTL: Duration = Duration::from_secs(6 * 60 * 60);
/// A failed check (offline, rate-limited) is retried sooner, but not on
/// every page load.
const FAILURE_TTL: Duration = Duration::from_secs(30 * 60);
const RELEASE_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Release {
    pub version: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct About {
    pub version: &'static str,
    pub repository: &'static str,
    /// `openshell --version` on this machine; absent when the CLI is not on PATH.
    pub openshell_cli_version: Option<String>,
    pub update_check: bool,
    /// The newest published release; absent when the check is off or failed.
    pub latest_release: Option<Release>,
    pub update_available: bool,
}

/// Looks up the latest release, at most once per TTL. `None` disables the
/// check entirely (`--no-update-check`): nothing leaves the machine.
pub struct Updates {
    url: Option<String>,
    client: reqwest::Client,
    cache: Mutex<Option<(Instant, Option<Release>)>>,
}

impl Updates {
    pub fn new(url: Option<String>) -> Self {
        let client = reqwest::Client::builder()
            .user_agent(concat!("openshell-webui/", env!("CARGO_PKG_VERSION")))
            .timeout(RELEASE_TIMEOUT)
            .build()
            .unwrap_or_default();
        Self { url, client, cache: Mutex::new(None) }
    }

    pub fn enabled(&self) -> bool {
        self.url.is_some()
    }

    pub async fn latest(&self) -> Option<Release> {
        let url = self.url.as_deref()?;
        let mut cache = self.cache.lock().await;
        if let Some((at, release)) = cache.as_ref() {
            let ttl = if release.is_some() { RELEASE_TTL } else { FAILURE_TTL };
            if at.elapsed() < ttl {
                return release.clone();
            }
        }
        let release = self.fetch(url).await.inspect_err(|e| tracing::debug!("update check failed: {e}")).ok();
        *cache = Some((Instant::now(), release.clone()));
        release
    }

    async fn fetch(&self, url: &str) -> Result<Release, reqwest::Error> {
        #[derive(Deserialize)]
        struct GitHubRelease {
            tag_name: String,
            html_url: String,
        }
        let r: GitHubRelease = self
            .client
            .get(url)
            .header("accept", "application/vnd.github+json")
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(Release { version: r.tag_name.trim_start_matches('v').to_owned(), url: r.html_url })
    }
}

pub async fn about(updates: &Updates) -> About {
    let (cli, latest) = tokio::join!(openshell_cli_version(), updates.latest());
    let update_available = latest.as_ref().is_some_and(|r| newer(&r.version, VERSION));
    About {
        version: VERSION,
        repository: REPOSITORY,
        openshell_cli_version: cli,
        update_check: updates.enabled(),
        latest_release: latest,
        update_available,
    }
}

async fn openshell_cli_version() -> Option<String> {
    if !command::exists("openshell") {
        return None;
    }
    command::output("openshell", &["--version"]).await.ok().and_then(|out| parse_cli_version(&out))
}

/// `openshell 0.1.5` → `0.1.5`.
fn parse_cli_version(out: &str) -> Option<String> {
    out.split_whitespace().last().map(|v| v.trim_start_matches('v').to_owned())
}

/// Whether `candidate` is a later version than `current`. Pre-releases
/// (`0.2.0-rc.1`) never count: GitHub's "latest" skips them anyway, and an
/// unparsable version is never reported as an update.
fn newer(candidate: &str, current: &str) -> bool {
    match (parse(candidate), parse(current)) {
        (Some(a), Some(b)) => a.cmp(&b) == Ordering::Greater,
        _ => false,
    }
}

fn parse(v: &str) -> Option<(u64, u64, u64)> {
    let v = v.trim_start_matches('v');
    if v.contains('-') {
        return None;
    }
    let mut parts = v.split('.').map(|p| p.parse::<u64>().ok());
    let triple = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(triple)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions_numerically() {
        assert!(newer("0.1.10", "0.1.9"));
        assert!(newer("v1.0.0", "0.9.9"));
        assert!(!newer("0.1.1", "0.1.1"));
        assert!(!newer("0.1.0", "0.1.1"));
        assert!(!newer("0.2.0-rc.1", "0.1.1"));
        assert!(!newer("garbage", "0.1.1"));
        assert!(!newer("0.2", "0.1.1"));
    }

    #[test]
    fn parses_the_cli_version_line() {
        assert_eq!(parse_cli_version("openshell 0.1.5\n").as_deref(), Some("0.1.5"));
        assert_eq!(parse_cli_version("openshell v0.2.0").as_deref(), Some("0.2.0"));
        assert_eq!(parse_cli_version(""), None);
    }
}
