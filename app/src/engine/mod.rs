//! Processing facade: shared job contract and dispatch.
//! Backend details live in purpose-specific sibling modules.
mod events;
mod images;
mod installer;
mod media;
mod ncnn;
mod process;
mod pytorch;
mod runtime;
mod videos;

pub(crate) use process::host_command;
pub(crate) use runtime::{models_for, runtime_summary};

use async_channel::Sender;
use images::run_images;
use installer::install_pytorch;
use media::{is_image, is_video};
use std::{
    path::PathBuf,
    sync::{Arc, atomic::AtomicBool},
};
use videos::run_videos;

#[derive(Clone)]
pub struct JobRequest {
    pub mode: String,
    pub input: PathBuf,
    pub output: Option<PathBuf>,
    pub backend: String,
    pub model: String,
    pub scale: u8,
    pub format: String,
    pub tta: bool,
    pub tile_size: u32,
    pub low_vram: bool,
    pub pytorch_encoder: String,
    pub pytorch_skip_duplicates: bool,
    pub image_quality: u8,
    pub custom_python_path: Option<PathBuf>,
    pub batch_size: u16,
}

pub enum JobEvent {
    Log(String),
    Progress { fraction: f32, stage: String },
    Done(PathBuf),
    Failed(String),
    Cancelled,
}

enum RunError {
    Cancelled,
    Failed(String),
}
impl From<String> for RunError {
    fn from(value: String) -> Self {
        Self::Failed(value)
    }
}
impl From<&str> for RunError {
    fn from(value: &str) -> Self {
        Self::Failed(value.to_owned())
    }
}
pub fn run(request: JobRequest, events: Sender<JobEvent>, cancel: Arc<AtomicBool>) {
    let result = run_inner(&request, &events, &cancel);
    let event = match result {
        Ok(path) => JobEvent::Done(path),
        Err(RunError::Cancelled) => JobEvent::Cancelled,
        Err(RunError::Failed(error)) => JobEvent::Failed(error),
    };
    let _ = events.send_blocking(event);
}

fn run_inner(
    request: &JobRequest,
    events: &Sender<JobEvent>,
    cancel: &Arc<AtomicBool>,
) -> Result<PathBuf, RunError> {
    if request.mode == "installer" {
        return install_pytorch(events, cancel);
    }
    if !request.input.exists() {
        return Err("The selected input no longer exists.".into());
    }
    if request.input.is_file() {
        let matches = if request.mode == "image" {
            is_image(&request.input)
        } else {
            is_video(&request.input)
        };
        if !matches {
            return Err(format!(
                "Unsupported {} file: {}",
                request.mode,
                request.input.display()
            )
            .into());
        }
    }
    if request.mode == "image" {
        run_images(request, events, cancel)
    } else {
        run_videos(request, events, cancel)
    }
}
