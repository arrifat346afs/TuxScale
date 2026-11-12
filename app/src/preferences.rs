use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Preferences {
    pub interface_scale: u16,
    pub mode: String,
    pub batch: bool,
    pub backend: String,
    pub model: String,
    pub scale: u8,
    pub format: String,
    pub output: Option<PathBuf>,
    pub tta: bool,
    pub tile_size: u32,
    pub low_vram: bool,
    pub pytorch_encoder: String,
    pub pytorch_skip_duplicates: bool,
    pub image_quality: u8,
    pub custom_python_path: Option<PathBuf>,
    pub batch_size: u16,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            interface_scale: 80,
            mode: "video".into(),
            batch: false,
            backend: "Auto".into(),
            model: "realesr-animevideov3".into(),
            scale: 4,
            format: "mp4".into(),
            output: None,
            tta: false,
            tile_size: 0,
            low_vram: false,
            pytorch_encoder: "auto".into(),
            pytorch_skip_duplicates: true,
            image_quality: 95,
            custom_python_path: None,
            batch_size: 10,
        }
    }
}

fn config_file() -> PathBuf {
    let root = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
        .unwrap_or_else(|| PathBuf::from("."));
    root.join("tuxscale").join("settings.json")
}

pub fn load() -> Preferences {
    fs::read(config_file())
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

pub fn save(preferences: &Preferences) {
    let target = config_file();
    if let Some(parent) = target.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(contents) = serde_json::to_vec_pretty(preferences) {
        let _ = fs::write(target, contents);
    }
}
