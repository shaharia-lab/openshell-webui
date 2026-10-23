//! Log lines of the gateway running on this machine. The gateway logs either
//! to files (Homebrew service: `openshell-gateway.{out,err}.log`) or to the
//! journal (systemd user unit `openshell-gateway`). Both print the same
//! tracing format, so one parser serves both sources.

use std::{
    path::{Path, PathBuf},
    sync::LazyLock,
};

use regex::Regex;
use serde::Serialize;

use super::command;
use crate::files;

const LOG_FILES: [&str; 2] = ["openshell-gateway.out.log", "openshell-gateway.err.log"];
const SYSTEMD_UNIT: &str = "openshell-gateway";

static ANSI: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\x1b\[[0-9;]*[A-Za-z]").unwrap());
static LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z)\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+(.*)$").unwrap()
});

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LogLine {
    pub time: String,
    pub level: String,
    pub file: String,
    pub msg: String,
}

/// Where the local gateway writes its logs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LogSource {
    Files(PathBuf),
    Journal { unit: String },
}

impl LogSource {
    /// Uses `dir` when given; otherwise the Homebrew log directory when it
    /// exists, then the systemd journal.
    pub async fn detect(dir: Option<PathBuf>) -> Self {
        if let Some(dir) = dir {
            return Self::Files(dir);
        }
        if let Some(prefix) = command::output("brew", &["--prefix"]).await.ok().map(|o| o.trim().to_owned()) {
            let dir = Path::new(&prefix).join("var/log/openshell");
            if dir.is_dir() {
                return Self::Files(dir);
            }
        }
        Self::Journal { unit: SYSTEMD_UNIT.to_owned() }
    }

    /// Human-readable location, shown in the UI.
    pub fn describe(&self) -> String {
        match self {
            Self::Files(dir) => dir.display().to_string(),
            Self::Journal { unit } => format!("journalctl --user -u {unit}"),
        }
    }

    /// The last `n` lines of each log stream.
    pub async fn tail(&self, n: usize) -> Vec<LogLine> {
        match self {
            Self::Files(dir) => LOG_FILES
                .iter()
                .flat_map(|name| {
                    let raw = files::tail(&dir.join(name), 2 << 20).unwrap_or_default();
                    last(parse(&String::from_utf8_lossy(&raw), name), n)
                })
                .collect(),
            Self::Journal { unit } => {
                let lines = n.to_string();
                let args = ["--user", "-u", unit, "-n", &lines, "-o", "cat", "--no-pager"];
                let raw = command::output("journalctl", &args).await.unwrap_or_default();
                last(parse(&raw, "journal"), n)
            }
        }
    }
}

fn last(mut lines: Vec<LogLine>, n: usize) -> Vec<LogLine> {
    lines.drain(..lines.len().saturating_sub(n));
    lines
}

/// Parses tracing output; continuation lines are appended to the previous
/// entry.
pub fn parse(raw: &str, file: &str) -> Vec<LogLine> {
    let clean = ANSI.replace_all(raw, "");
    let mut out: Vec<LogLine> = Vec::new();
    for l in clean.lines().filter(|l| !l.trim().is_empty()) {
        if let Some(c) = LINE.captures(l) {
            out.push(LogLine { time: c[1].into(), level: c[2].into(), file: file.into(), msg: c[3].into() });
        } else if let Some(prev) = out.last_mut() {
            prev.msg.push('\n');
            prev.msg.push_str(l);
        } else {
            out.push(LogLine { time: String::new(), level: String::new(), file: file.into(), msg: l.into() });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_colored_tracing_lines_and_continuations() {
        let raw = "\x1b[2m2026-10-22T21:58:20.664412Z\x1b[0m \x1b[32m INFO\x1b[0m sweep done\n  detail\n\
                   2026-10-22T21:59:00Z ERROR boom\n";
        let lines = parse(raw, "journal");
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].level, "INFO");
        assert_eq!(lines[0].msg, "sweep done\n  detail");
        assert_eq!(lines[1].level, "ERROR");
        assert_eq!(parse("orphan\n", "f")[0].msg, "orphan");
    }

    #[tokio::test]
    async fn file_source_tails_each_file() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join(LOG_FILES[0]), "2026-01-01T00:00:00Z INFO a\n2026-01-01T00:00:01Z INFO b\n")
            .unwrap();
        let src = LogSource::Files(tmp.path().into());
        let lines = src.tail(1).await;
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].msg, "b");
        assert_eq!(src.describe(), tmp.path().display().to_string());
    }
}
