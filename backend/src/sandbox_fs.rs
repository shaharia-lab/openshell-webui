//! File operations inside a sandbox, built on [`exec`](crate::exec). Paths are
//! passed to `sh -c` as positional arguments, never spliced into the script,
//! and the sandbox policy still decides what the command may touch.

use std::time::Duration;

use bytes::Bytes;
use serde::Serialize;

use crate::{
    error::ApiError,
    exec::{self, Target},
    gateway::GatewayClient,
};

/// Largest file that can be downloaded or uploaded through the console.
pub const MAX_FILE: usize = 64 << 20;
const MAX_LISTING: usize = 8 << 20;
const TIMEOUT: Duration = Duration::from_secs(120);

/// `%y` type, `%s` size, `%T@` mtime, `%m` mode, `%u` owner, `%P` name;
/// entries are NUL-terminated so any file name is safe.
const LIST: &str = r#"find "$1" -mindepth 1 -maxdepth 1 -printf '%y\t%s\t%T@\t%m\t%u\t%l\t%P\0'"#;
const READ: &str = r#"test -f "$1" || { echo "not a regular file: $1" >&2; exit 1; }; cat -- "$1""#;
const WRITE: &str = r#"cat > "$1""#;
const MKDIR: &str = r#"mkdir -p -- "$1""#;
const REMOVE: &str = r#"rm -rf -- "$1""#;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Entry {
    pub name: String,
    /// `file`, `dir`, `symlink` or `other`.
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub size: u64,
    /// Modification time, Unix seconds.
    pub mtime: i64,
    /// Octal permission bits, e.g. `755`.
    pub mode: String,
    pub owner: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub link_target: String,
}

/// Validates a path: absolute, no NUL, no `..` segments, bounded length.
pub fn check_path(path: &str) -> Result<&str, ApiError> {
    let ok =
        path.starts_with('/') && path.len() < 4096 && !path.contains('\0') && !path.split('/').any(|seg| seg == "..");
    if ok { Ok(path) } else { Err(ApiError::bad_request("path must be absolute and must not contain '..'")) }
}

/// A sandbox file system reached through one gateway client.
pub struct SandboxFs<'a> {
    pub client: &'a GatewayClient,
    pub target: Target,
}

impl SandboxFs<'_> {
    async fn sh(&self, script: &str, path: &str, stdin: Bytes, max_output: usize) -> Result<exec::Output, ApiError> {
        let argv = ["/bin/sh", "-c", script, "sh", check_path(path)?].map(str::to_owned).to_vec();
        exec::run(self.client, &self.target, argv, stdin, max_output, TIMEOUT).await?.check()
    }

    /// Lists a directory, directories first, then by name.
    pub async fn list(&self, path: &str) -> Result<Vec<Entry>, ApiError> {
        let out = self.sh(LIST, path, Bytes::new(), MAX_LISTING).await?;
        let mut entries = parse_listing(&out.stdout);
        entries.sort_by(|a, b| (a.kind != "dir").cmp(&(b.kind != "dir")).then_with(|| a.name.cmp(&b.name)));
        Ok(entries)
    }

    pub async fn read(&self, path: &str) -> Result<Vec<u8>, ApiError> {
        Ok(self.sh(READ, path, Bytes::new(), MAX_FILE).await?.stdout)
    }

    pub async fn write(&self, path: &str, content: Bytes) -> Result<(), ApiError> {
        self.sh(WRITE, path, content, 0).await.map(drop)
    }

    pub async fn mkdir(&self, path: &str) -> Result<(), ApiError> {
        self.sh(MKDIR, path, Bytes::new(), 0).await.map(drop)
    }

    pub async fn remove(&self, path: &str) -> Result<(), ApiError> {
        if path.trim_end_matches('/').is_empty() {
            return Err(ApiError::bad_request("refusing to remove /"));
        }
        self.sh(REMOVE, path, Bytes::new(), 0).await.map(drop)
    }
}

fn parse_listing(raw: &[u8]) -> Vec<Entry> {
    raw.split(|&b| b == 0)
        .filter(|rec| !rec.is_empty())
        .filter_map(|rec| {
            let rec = String::from_utf8_lossy(rec);
            let f: Vec<&str> = rec.splitn(7, '\t').collect();
            let [kind, size, mtime, mode, owner, link, name] = f.as_slice() else { return None };
            Some(Entry {
                name: (*name).to_owned(),
                kind: match *kind {
                    "f" => "file",
                    "d" => "dir",
                    "l" => "symlink",
                    _ => "other",
                },
                size: size.parse().unwrap_or(0),
                mtime: mtime.split('.').next().and_then(|s| s.parse().ok()).unwrap_or(0),
                mode: (*mode).to_owned(),
                owner: (*owner).to_owned(),
                link_target: (*link).to_owned(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_are_validated() {
        assert!(check_path("/sandbox/a b.txt").is_ok());
        assert!(check_path("relative").is_err());
        assert!(check_path("/sandbox/../etc").is_err());
        assert!(check_path("/a\0b").is_err());
    }

    #[test]
    fn parses_find_output() {
        let raw = b"f\t12\t1700000000.5\t644\tsandbox\t\tnotes.txt\0d\t4096\t1700000001.0\t755\tsandbox\t\tsrc\0\
                    l\t7\t1700000002.0\t777\tsandbox\t/etc/x\tlink\0bad record\0";
        let entries = parse_listing(raw);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].kind, "file");
        assert_eq!(entries[0].size, 12);
        assert_eq!(entries[0].mtime, 1_700_000_000);
        assert_eq!(entries[1].kind, "dir");
        assert_eq!(entries[2].link_target, "/etc/x");
    }
}
