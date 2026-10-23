//! Validation of user-supplied names and small query values.

use std::{sync::LazyLock, time::Duration};

use regex::Regex;

static NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$").unwrap());
static SINCE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^([0-9]{1,5})([smhd])$").unwrap());

/// Sandbox, workspace and similar resource names.
pub fn is_name(s: &str) -> bool {
    NAME.is_match(s)
}

/// Parses a relative duration such as `30s`, `5m`, `1h` or `2d`.
pub fn parse_since(s: &str) -> Option<Duration> {
    let caps = SINCE.captures(s)?;
    let n: u64 = caps[1].parse().ok()?;
    let unit = match &caps[2] {
        "s" => 1,
        "m" => 60,
        "h" => 3600,
        _ => 86_400,
    };
    Some(Duration::from_secs(n * unit))
}

/// Parses an integer query value, falling back to `default` and clamping to
/// `lo..=hi`.
pub fn clamp(value: Option<&str>, default: u32, lo: u32, hi: u32) -> u32 {
    value.and_then(|v| v.parse::<u32>().ok()).unwrap_or(default).clamp(lo, hi)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert!(is_name("demo"));
        assert!(is_name("my-sandbox_1.2"));
        assert!(!is_name(""));
        assert!(!is_name("-leading"));
        assert!(!is_name("has space"));
        assert!(!is_name("../etc"));
        assert!(!is_name(&"a".repeat(64)));
    }

    #[test]
    fn since() {
        assert_eq!(parse_since("30s"), Some(Duration::from_secs(30)));
        assert_eq!(parse_since("5m"), Some(Duration::from_secs(300)));
        assert_eq!(parse_since("2d"), Some(Duration::from_secs(172_800)));
        assert_eq!(parse_since("5"), None);
        assert_eq!(parse_since("1w"), None);
    }

    #[test]
    fn clamping() {
        assert_eq!(clamp(None, 500, 1, 5000), 500);
        assert_eq!(clamp(Some("x"), 500, 1, 5000), 500);
        assert_eq!(clamp(Some("0"), 500, 1, 5000), 1);
        assert_eq!(clamp(Some("99999"), 500, 1, 5000), 5000);
    }
}
