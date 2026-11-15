//! Video job iteration and audio export.
use super::{JobEvent, JobRequest, RunError};
use super::{
    events::{log, progress},
    media::{media_files, safe_output},
    ncnn::run_ncnn_video,
    process::{host_command, run_command},
    pytorch::run_pytorch_video,
    runtime::{check_media_tool, choose_backend},
};
use async_channel::Sender;
use std::{
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

pub(super) fn run_videos(
    request: &JobRequest,
    events: &Sender<JobEvent>,
    cancel: &Arc<AtomicBool>,
) -> Result<PathBuf, RunError> {
    // Fail before loading a model or extracting frames, with the loader error
    // visible when a system FFmpeg installation is broken.
    check_media_tool("ffmpeg")?;
    check_media_tool("ffprobe")?;
    let inputs = media_files(&request.input, false)?;
    if inputs.is_empty() {
        return Err("No supported video files were found.".into());
    }
    let mut last_output = PathBuf::new();
    for (index, input) in inputs.iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            return Err(RunError::Cancelled);
        }
        let audio_only = matches!(request.format.as_str(), "mp3" | "wav" | "aac" | "flac");
        let output = safe_output(
            input,
            request.output.as_deref(),
            &request.format,
            if audio_only { "_audio" } else { "_upscaled" },
        )?;
        log(
            events,
            format!(
                "Upscaling video {} of {}: {}",
                index + 1,
                inputs.len(),
                input.display()
            ),
        );
        progress(
            events,
            index as f32 / inputs.len() as f32,
            format!("Video {}/{}", index + 1, inputs.len()),
        );
        if audio_only {
            extract_audio(input, &output, &request.format, events, cancel)?;
        } else if choose_backend(&request.backend) == "pytorch" {
            run_pytorch_video(input, &output, request, events, cancel)?;
        } else {
            run_ncnn_video(input, &output, request, events, cancel)?;
        }
        last_output = output;
        progress(
            events,
            (index + 1) as f32 / inputs.len() as f32,
            format!("Finished video {}/{}", index + 1, inputs.len()),
        );
    }
    Ok(last_output)
}

pub(super) fn extract_audio(
    input: &Path,
    output: &Path,
    format: &str,
    events: &Sender<JobEvent>,
    cancel: &Arc<AtomicBool>,
) -> Result<(), RunError> {
    let codec = match format {
        "wav" => "pcm_s16le",
        "aac" => "aac",
        "flac" => "flac",
        _ => "libmp3lame",
    };
    log(events, format!("Extracting audio as {format}"));
    progress(events, 0.1, "Extracting audio");
    let mut command = host_command("ffmpeg");
    command
        .arg("-y")
        .arg("-i")
        .arg(input)
        .arg("-vn")
        .arg("-c:a")
        .arg(codec)
        .arg(output);
    run_command(command, events, cancel)
}
