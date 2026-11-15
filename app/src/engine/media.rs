//! Media discovery and collision-safe output paths.
use std::{
    fs,
    path::{Path, PathBuf},
};

pub(super) fn is_image(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "bmp" | "tif" | "tiff"
    )
}

pub(super) fn is_video(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "mp4" | "webm" | "mkv" | "avi" | "mov" | "flv" | "wmv" | "ts" | "m4v" | "mpeg" | "mpg"
    )
}

pub(super) fn media_files(path: &Path, image: bool) -> Result<Vec<PathBuf>, String> {
    if path.is_file() {
        return Ok(vec![path.to_path_buf()]);
    }
    let mut files = fs::read_dir(path)
        .map_err(|e| format!("Cannot read folder: {e}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|entry| {
            entry.is_file()
                && if image {
                    is_image(entry)
                } else {
                    is_video(entry)
                }
        })
        .collect::<Vec<_>>();
    files.sort();
    Ok(files)
}

pub(super) fn safe_output(
    input: &Path,
    output: Option<&Path>,
    format: &str,
    suffix: &str,
) -> Result<PathBuf, String> {
    let folder = output
        .map(Path::to_path_buf)
        .unwrap_or_else(|| input.parent().unwrap_or(Path::new(".")).join("upscaled"));
    fs::create_dir_all(&folder).map_err(|e| format!("Cannot create output folder: {e}"))?;
    let name = input.file_stem().unwrap_or_default().to_string_lossy();
    let extension = format.trim_start_matches('.');
    let mut candidate = folder.join(format!("{name}{suffix}.{extension}"));
    let mut index = 1;
    while candidate.exists() || candidate == input {
        candidate = folder.join(format!("{name}{suffix}_{index}.{extension}"));
        index += 1;
    }
    Ok(candidate)
}
