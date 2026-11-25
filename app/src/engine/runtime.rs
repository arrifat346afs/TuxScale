//! Installed resources, model discovery, Python selection and readiness checks.
use super::process::host_command;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Stdio,
};

pub(super) fn installed_root() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|executable| {
            executable
                .parent()?
                .parent()
                .map(|prefix| prefix.join("share/tuxscale"))
        })
        .filter(|path| path.join("resources").is_dir())
}

pub(crate) fn is_packaged() -> bool {
    installed_root().is_some()
}

pub(crate) fn project_root() -> PathBuf {
    installed_root().unwrap_or_else(|| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap_or(Path::new("."))
            .to_path_buf()
    })
}

pub(super) fn models_dir() -> PathBuf {
    project_root().join("resources/models")
}

pub(crate) fn models_for(backend: &str) -> Vec<String> {
    let extension = if backend == "PyTorch" { "pth" } else { "param" };
    let mut models = fs::read_dir(models_dir())
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some(extension))
        .filter_map(|path| {
            path.file_stem()
                .map(|name| name.to_string_lossy().into_owned())
        })
        .collect::<Vec<_>>();
    models.sort();
    models
}

pub(crate) fn runtime_summary(custom_python: Option<&Path>) -> String {
    let ncnn = project_root()
        .join("resources/linux/bin/upscayl-bin")
        .is_file();
    let ffmpeg = host_command("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    let ffprobe = check_media_tool("ffprobe").is_ok();
    let python = python_command(custom_python);
    let pytorch = host_command(&python)
        .args(["-c", "import torch; print('PyTorch ' + torch.__version__ + (' · CUDA ready · ' + torch.cuda.get_device_name(0) if torch.cuda.is_available() else ' · CUDA unavailable'))"])
        .output().ok().filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_owned()).unwrap_or_else(|| "PyTorch not detected".into());
    format!(
        "NCNN: {} · FFmpeg: {} · FFprobe: {} · Models: {}\nPython: {}\n{}",
        if ncnn { "found" } else { "missing" },
        if ffmpeg { "found" } else { "missing" },
        if ffprobe {
            "found"
        } else {
            "missing or unavailable"
        },
        if models_dir().is_dir() {
            "found"
        } else {
            "missing"
        },
        python,
        pytorch
    )
}

pub(super) fn check_media_tool(program: &str) -> Result<(), String> {
    let output = host_command(program).arg("-version").output().map_err(|error| {
        format!("Could not start {program}: {error}. Install FFmpeg and FFprobe and ensure they are on PATH.")
    })?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "{program} exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

pub(super) fn python_command(custom_path: Option<&Path>) -> String {
    if let Some(custom) = custom_path {
        if !custom.as_os_str().is_empty() {
            return custom.to_string_lossy().into_owned();
        }
    }
    if let Ok(custom) = std::env::var("TUXSCALE_PYTHON_PATH") {
        if !custom.trim().is_empty() {
            return custom;
        }
    }
    if let Some(installed) = installed_root() {
        return installed
            .join("resources/python-env/bin/python3")
            .to_string_lossy()
            .into_owned();
    }
    let root = project_root();
    let mut candidates = vec![
        root.join("resources/python-env/bin/python3"),
        root.join("resources/python-env/bin/python"),
        config_dir().join("tuxscale/pytorch-env/bin/python3"),
        config_dir().join("tuxscale/pytorch-env/bin/python"),
    ];
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        // Also reuse the environments detected by the original application.
        for directory in [
            home.join(".config/tuxscale/pytorch-env"),
            home.join(".venvs/tuxscale"),
        ] {
            candidates.push(directory.join("bin/python3"));
            candidates.push(directory.join("bin/python"));
        }
    }
    for candidate in candidates {
        if candidate.is_file() {
            return candidate.to_string_lossy().into_owned();
        }
    }
    "python3".into()
}

pub(super) fn config_dir() -> PathBuf {
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
        .unwrap_or_else(|| PathBuf::from("."))
}

pub(super) fn choose_backend(preference: &str) -> &'static str {
    if preference == "PyTorch" {
        "pytorch"
    } else {
        "ncnn"
    }
}
