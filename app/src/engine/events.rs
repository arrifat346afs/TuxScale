//! Shared worker log and progress reporting.
use super::JobEvent;
use async_channel::Sender;

pub(super) fn log(events: &Sender<JobEvent>, message: impl Into<String>) {
    let _ = events.send_blocking(JobEvent::Log(message.into()));
}

pub(super) fn progress(events: &Sender<JobEvent>, fraction: f32, stage: impl Into<String>) {
    let _ = events.send_blocking(JobEvent::Progress {
        fraction,
        stage: stage.into(),
    });
}
