//! Small file helpers.

use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
};

/// The last `max` bytes of a file, without a leading partial line.
pub fn tail(path: &Path, max: u64) -> std::io::Result<Vec<u8>> {
    let mut f = File::open(path)?;
    let size = f.metadata()?.len();
    let offset = size.saturating_sub(max);
    f.seek(SeekFrom::Start(offset))?;
    let mut buf = Vec::with_capacity((size - offset) as usize);
    f.read_to_end(&mut buf)?;
    if offset > 0
        && let Some(i) = buf.iter().position(|&b| b == b'\n')
    {
        buf.drain(..=i);
    }
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tail_drops_partial_first_line() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("f");
        std::fs::write(&p, "first line\nsecond\nthird\n").unwrap();
        assert_eq!(tail(&p, 1000).unwrap(), b"first line\nsecond\nthird\n");
        assert_eq!(tail(&p, 10).unwrap(), b"third\n");
        assert!(tail(&tmp.path().join("missing"), 10).is_err());
    }
}
