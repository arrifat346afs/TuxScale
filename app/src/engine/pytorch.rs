//! Python image/video worker command construction and export conversion.
use super::{JobEvent, JobRequest, RunError};
use super::{
    process::{host_command, run_command},
    runtime::{models_dir, project_root, python_command},
};
use async_channel::Sender;
use std::fs;
use std::{
    path::Path,
    sync::{Arc, atomic::AtomicBool},
};

pub(super) fn run_pytorch_image(
    input: &Path,
    output: &Path,
    request: &JobRequest,
    events: &Sender<JobEvent>,
    cancel: &Arc<AtomicBool>,
) -> Result<(), RunError> {
    let script = project_root().join("resources/python/tuxscale_upscale_images.py");
    if !script.is_file() {
        return Err(format!("PyTorch image worker is missing: {}", script.display()).into());
    }
    let tile_size = if request.low_vram {
        request.tile_size.max(512)
    } else {
        0
    };
    let mut command = host_command(python_command(request.custom_python_path.as_deref()));
    command
        .arg(script)
        .arg("--inputs")
        .arg(input)
        .arg("--outputs")
        .arg(output)
        .arg("--model")
        .arg(&request.model)
        .arg("--scale")
        .arg(request.scale.to_string())
        .arg("--format")
        .arg(&request.format)
        .arg("--quality")
        .arg(request.image_quality.to_string())
        .arg("--tile")
        .arg(tile_size.to_string())
        .arg("--weights-dir")
        .arg(models_dir());
    if request.low_vram {
        command.arg("--low-vram");
    }
    run_command(command, events, cancel)
}

pub(super) fn run_pytorch_video(
    input: &Path,
    output: &Path,
    request: &JobRequest,
    events: &Sender<JobEvent>,
    cancel: &Arc<AtomicBool>,
) -> Result<(), RunError> {
    let script = project_root().join("resources/python/tuxscale_upscale.py");
    if !script.is_file() {
        return Err(format!("PyTorch video worker is missing: {}", script.display()).into());
    }
    let intermediate = output.with_file_name(format!(
        ".tuxscale-{}-{}.mp4",
        std::process::id(),
        output.file_stem().unwrap_or_default().to_string_lossy()
    ));
    let mut command = host_command(python_command(request.custom_python_path.as_deref()));
    command
        .arg(script)
        .arg("--input")
        .arg(input)
        .arg("--output")
        .arg(&intermediate)
        .arg("--model")
        .arg(&request.model)
        .arg("--scale")
        .arg(request.scale.to_string())
        .arg("--tile")
        .arg(if request.low_vram {
            request.tile_size.max(512).to_string()
        } else {
            "0".into()
        })
        .arg("--encoder")
        .arg(&request.pytorch_encoder)
        .arg("--ffmpeg-bin")
        .arg("ffmpeg")
        .arg("--weights-dir")
        .arg(models_dir());
    if request.pytorch_skip_duplicates {
        command.arg("--skip-duplicates");
    } else {
        command.arg("--no-skip-duplicates");
    }
    run_command(command, events, cancel)?;
    if request.format == "mp4" {
        fs::rename(&intermediate, output).map_err(|error| {
            RunError::Failed(format!("Could not finalize video output: {error}"))
        })?;
        return Ok(());
    }
    let video_codec = match request.format.as_str() {
        "webm" => "libvpx-vp9",
        "avi" => "mpeg4",
        _ => "libx264",
    };
    let mut conversion = host_command("ffmpeg");
    conversion
        .arg("-y")
        .arg("-i")
        .arg(&intermediate)
        .arg("-c:v")
        .arg(video_codec)
        .arg("-c:a")
        .arg("copy")
        .arg(output);
    let conversion_result = run_command(conversion, events, cancel);
    let _ = fs::remove_file(intermediate);
    conversion_result
}
