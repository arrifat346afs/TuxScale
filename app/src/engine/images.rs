//! Image job iteration and backend dispatch.
use super::{JobEvent, JobRequest, RunError};
use super::{
    events::{log, progress},
    media::{media_files, safe_output},
    ncnn::run_ncnn_image,
    pytorch::run_pytorch_image,
    runtime::choose_backend,
};
use async_channel::Sender;
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

pub(super) fn run_images(
    request: &JobRequest,
    events: &Sender<JobEvent>,
    cancel: &Arc<AtomicBool>,
) -> Result<PathBuf, RunError> {
    let inputs = media_files(&request.input, true)?;
    if inputs.is_empty() {
        return Err("No supported image files were found.".into());
    }
    let mut last_output = PathBuf::new();
    for (index, input) in inputs.iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            return Err(RunError::Cancelled);
        }
        let output = safe_output(
            input,
            request.output.as_deref(),
            &request.format,
            "_upscaled",
        )?;
        log(
            events,
            format!(
                "Upscaling image {} of {}: {}",
                index + 1,
                inputs.len(),
                input.display()
            ),
        );
        progress(
            events,
            index as f32 / inputs.len() as f32,
            format!("Image {}/{}", index + 1, inputs.len()),
        );
        if choose_backend(&request.backend) == "pytorch" {
            run_pytorch_image(input, &output, request, events, cancel)?;
        } else {
            run_ncnn_image(input, &output, request, events, cancel)?;
        }
        last_output = output;
        progress(
            events,
            (index + 1) as f32 / inputs.len() as f32,
            format!("Finished image {}/{}", index + 1, inputs.len()),
        );
    }
    Ok(last_output)
}
