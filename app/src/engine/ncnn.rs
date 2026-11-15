//! NCNN image inference and video frame batching.
use super::{JobEvent, JobRequest, RunError};
use super::{
    events::progress,
    process::{host_command, run_command},
    runtime::{models_dir, project_root},
};
use async_channel::Sender;
use std::{fs, process::Command};
use std::{
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

pub(super) fn run_ncnn_image(
    input: &Path,
    output: &Path,
    request: &JobRequest,
    events: &Sender<JobEvent>,
    cancel: &Arc<AtomicBool>,
) -> Result<(), RunError> {
    let binary = project_root().join("resources/linux/bin/upscayl-bin");
    if !binary.is_file() {
        return Err(format!("NCNN executable is missing: {}", binary.display()).into());
    }
    let compression = if request.format == "png" { "0" } else { "5" };
    let mut command = Command::new(binary);
    command
        .arg("-i")
        .arg(input)
        .arg("-o")
        .arg(output)
        .arg("-m")
        .arg(models_dir())
        .arg("-n")
        .arg(&request.model)
        .arg("-s")
        .arg(request.scale.to_string())
        .arg("-f")
        .arg(&request.format)
        .arg("-c")
        .arg(compression);
    if request.tta {
        command.arg("-x");
    }
    if request.tile_size > 0 {
        command.arg("-t").arg(request.tile_size.to_string());
    }
    run_command(command, events, cancel)
}

pub(super) fn run_ncnn_video(
    input: &Path,
    output: &Path,
    request: &JobRequest,
    events: &Sender<JobEvent>,
    cancel: &Arc<AtomicBool>,
) -> Result<(), RunError> {
    let base = std::env::temp_dir().join(format!("tuxscale-{}", std::process::id()));
    let frames = base.join("frames");
    let upscaled = base.join("upscaled");
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&frames)
        .map_err(|e| format!("Cannot create temporary frames directory: {e}"))?;
    fs::create_dir_all(&upscaled)
        .map_err(|e| format!("Cannot create temporary output directory: {e}"))?;
    progress(events, 0.05, "Extracting video frames");
    let mut extract = host_command("ffmpeg");
    extract
        .arg("-y")
        .arg("-i")
        .arg(input)
        .arg("-q:v")
        .arg("2")
        .arg(frames.join("frame_%06d.jpg"));
    let result = run_command(extract, events, cancel);
    if result.is_err() {
        let _ = fs::remove_dir_all(&base);
        return result;
    }
    let binary = project_root().join("resources/linux/bin/upscayl-bin");
    let mut frame_files = fs::read_dir(&frames)
        .map_err(|error| RunError::Failed(format!("Could not list extracted frames: {error}")))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("jpg"))
        .collect::<Vec<_>>();
    frame_files.sort();
    if frame_files.is_empty() {
        let _ = fs::remove_dir_all(&base);
        return Err("FFmpeg did not extract any video frames.".into());
    }
    let frame_batch_size = usize::from(request.batch_size.max(1));
    let mut result = Ok(());
    for (batch_index, batch) in frame_files.chunks(frame_batch_size).enumerate() {
        if cancel.load(Ordering::SeqCst) {
            result = Err(RunError::Cancelled);
            break;
        }
        let batch_input = base.join(format!("batch-in-{batch_index}"));
        let batch_output = base.join(format!("batch-out-{batch_index}"));
        if let Err(error) =
            fs::create_dir_all(&batch_input).and_then(|_| fs::create_dir_all(&batch_output))
        {
            result = Err(RunError::Failed(format!(
                "Could not prepare frame batch: {error}"
            )));
            break;
        }
        let mut moved = true;
        for frame in batch {
            if let Err(error) = fs::rename(
                frame,
                batch_input.join(frame.file_name().unwrap_or_default()),
            ) {
                result = Err(RunError::Failed(format!(
                    "Could not prepare frame batch: {error}"
                )));
                moved = false;
                break;
            }
        }
        if !moved {
            break;
        }
        let mut upscale = Command::new(&binary);
        upscale
            .arg("-i")
            .arg(&batch_input)
            .arg("-o")
            .arg(&batch_output)
            .arg("-m")
            .arg(models_dir())
            .arg("-n")
            .arg(&request.model)
            .arg("-s")
            .arg(request.scale.to_string())
            .arg("-j")
            .arg("1:1:1")
            .arg("-f")
            .arg("jpg")
            .arg("-c")
            .arg("5");
        if request.tta {
            upscale.arg("-x");
        }
        if request.tile_size > 0 {
            upscale.arg("-t").arg(request.tile_size.to_string());
        }
        let fraction =
            0.2 + 0.65 * (batch_index * frame_batch_size) as f32 / frame_files.len() as f32;
        progress(
            events,
            fraction,
            format!("Upscaling frame batch {}", batch_index + 1),
        );
        if let Err(error) = run_command(upscale, events, cancel) {
            result = Err(error);
            break;
        }
        match fs::read_dir(&batch_output) {
            Ok(entries) => {
                for entry in entries.filter_map(Result::ok) {
                    if let Err(error) = fs::rename(entry.path(), upscaled.join(entry.file_name())) {
                        result = Err(RunError::Failed(format!(
                            "Could not collect upscaled frames: {error}"
                        )));
                        break;
                    }
                }
            }
            Err(error) => {
                result = Err(RunError::Failed(format!(
                    "Could not read upscaled frame batch: {error}"
                )))
            }
        }
        let _ = fs::remove_dir_all(&batch_input);
        let _ = fs::remove_dir_all(&batch_output);
        if result.is_err() {
            break;
        }
    }
    if result.is_ok() {
        let fps = host_command("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=r_frame_rate",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
            ])
            .arg(input)
            .output()
            .ok()
            .and_then(|out| String::from_utf8(out.stdout).ok())
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "30".into());
        let config = match request.format.as_str() {
            "webm" => vec!["-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p"],
            "avi" => vec!["-c:v", "mpeg4", "-pix_fmt", "yuv420p"],
            _ => vec!["-c:v", "libx264", "-pix_fmt", "yuv420p"],
        };
        let mut assemble = host_command("ffmpeg");
        assemble
            .arg("-y")
            .arg("-i")
            .arg(upscaled.join("frame_%06d.jpg"));
        assemble
            .arg("-i")
            .arg(input)
            .arg("-map")
            .arg("0:v:0")
            .arg("-map")
            .arg("1:a?");
        assemble
            .args(config)
            .arg("-c:a")
            .arg("copy")
            .arg("-r")
            .arg(&fps)
            .arg(output);
        progress(events, 0.9, "Reassembling video");
        let result = run_command(assemble, events, cancel);
        let _ = fs::remove_dir_all(&base);
        result
    } else {
        let _ = fs::remove_dir_all(&base);
        result
    }
}
