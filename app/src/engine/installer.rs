//! CUDA environment installation.
use super::{JobEvent, RunError};
use super::{
    events::{log, progress},
    process::{host_command, run_command},
    runtime::{config_dir, project_root},
};
use async_channel::Sender;
use std::{
    path::PathBuf,
    sync::{Arc, atomic::AtomicBool},
};

pub(super) fn install_pytorch(
    events: &Sender<JobEvent>,
    cancel: &Arc<AtomicBool>,
) -> Result<PathBuf, RunError> {
    let script = project_root().join("resources/python/setup-cuda-env.sh");
    if !script.is_file() {
        return Err(format!("PyTorch setup script is missing: {}", script.display()).into());
    }
    let config = config_dir().join("tuxscale");
    let environment = config.join("pytorch-env");
    let models = config.join("models");
    log(
        events,
        format!(
            "Installing the CUDA worker environment under {}",
            environment.display()
        ),
    );
    progress(events, 0.02, "Starting the PyTorch CUDA installer");
    let mut command = host_command("bash");
    command.arg(script).arg(&environment).arg(models);
    run_command(command, events, cancel)?;
    Ok(environment.join("bin/python3"))
}
