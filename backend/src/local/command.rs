//! Runs local CLIs (docker, journalctl, brew) with a timeout.

use std::time::Duration;

use tokio::process::Command;

const TIMEOUT: Duration = Duration::from_secs(20);

/// Runs `bin args...` and returns stdout. On failure the error carries stderr.
pub async fn output(bin: &str, args: &[&str]) -> Result<String, String> {
    output_with_env(bin, args, &[]).await
}

/// Like [`output`], with extra environment variables for the child.
pub async fn output_with_env(bin: &str, args: &[&str], env: &[(&str, &str)]) -> Result<String, String> {
    let run = Command::new(bin).args(args).envs(env.iter().copied()).kill_on_drop(true).output();
    let out = tokio::time::timeout(TIMEOUT, run)
        .await
        .map_err(|_| format!("{bin} timed out"))?
        .map_err(|e| format!("{bin}: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_owned();
        Err(if err.is_empty() { format!("{bin} exited with {}", out.status) } else { err })
    }
}

/// Whether `bin` resolves on `PATH`.
pub fn exists(bin: &str) -> bool {
    std::env::var_os("PATH").is_some_and(|paths| std::env::split_paths(&paths).any(|dir| dir.join(bin).is_file()))
}
