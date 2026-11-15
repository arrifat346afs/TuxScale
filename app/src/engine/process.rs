//! Host library isolation and cancellable worker execution.
use super::events::{log, progress};
use super::{JobEvent, RunError};
use async_channel::Sender;
use std::{
    ffi::{OsStr, OsString},
    io::{BufRead, BufReader},
    path::Path,
    process::{Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
    time::Duration,
};

pub(crate) fn host_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    restore_host_environment(
        &mut command,
        std::env::var_os("TUXSCALE_APPIMAGE_ENV").as_deref() == Some(OsStr::new("1")),
        std::env::var_os("TUXSCALE_ORIGINAL_LD_LIBRARY_PATH"),
        std::env::var_os("APPDIR"),
        std::env::var_os("LD_LIBRARY_PATH"),
    );
    command
}

pub(super) fn restore_host_environment(
    command: &mut Command,
    appimage_environment: bool,
    original: Option<OsString>,
    appdir: Option<OsString>,
    current: Option<OsString>,
) {
    let restored = if appimage_environment {
        Some(original)
    } else if let (Some(appdir), Some(current)) = (appdir, current) {
        // Compatibility with older AppRun launchers that did not save the env.
        let paths: Vec<_> = std::env::split_paths(&current)
            .filter(|path| !path.starts_with(Path::new(&appdir)))
            .collect();
        Some(if paths.is_empty() {
            None
        } else {
            std::env::join_paths(paths).ok()
        })
    } else {
        None
    };
    if let Some(restored) = restored {
        match restored {
            Some(value) => {
                command.env("LD_LIBRARY_PATH", value);
            }
            None => {
                command.env_remove("LD_LIBRARY_PATH");
            }
        }
        command
            .env_remove("TUXSCALE_APPIMAGE_ENV")
            .env_remove("TUXSCALE_ORIGINAL_LD_LIBRARY_PATH");
    }
}

pub(super) fn run_command(
    mut command: Command,
    events: &Sender<JobEvent>,
    cancel: &Arc<AtomicBool>,
) -> Result<(), RunError> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let program = command.get_program().to_string_lossy().to_string();
    let mut child = command
        .spawn()
        .map_err(|error| RunError::Failed(format!("Could not start {program}: {error}")))?;
    let (line_tx, line_rx) = mpsc::channel::<String>();
    if let Some(stdout) = child.stdout.take() {
        let lines = line_tx.clone();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let _ = lines.send(line);
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let lines = line_tx.clone();
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let _ = lines.send(line);
            }
        });
    }
    drop(line_tx);
    loop {
        while let Ok(line) = line_rx.try_recv() {
            if let Some(progress_line) = line.strip_prefix("PROGRESS:") {
                let mut parts = progress_line.splitn(2, ':');
                let percent = parts
                    .next()
                    .and_then(|value| value.parse::<f32>().ok())
                    .unwrap_or(0.0);
                let message = parts
                    .next()
                    .unwrap_or("Installing PyTorch CUDA environment");
                progress(events, percent / 100.0, message.to_owned());
                log(events, line);
                continue;
            }
            if line.starts_with("PROGRESS ") {
                let fields = line.split_whitespace().collect::<Vec<_>>();
                if fields.len() >= 3 {
                    if let (Ok(done), Ok(total)) =
                        (fields[1].parse::<f32>(), fields[2].parse::<f32>())
                    {
                        let fraction = if total > 0.0 { done / total } else { 0.0 };
                        progress(
                            events,
                            fraction,
                            format!("Upscaling {}/{}", done as u32, total as u32),
                        );
                    }
                }
            } else if !line.trim().is_empty() {
                log(events, line);
            }
        }
        if cancel.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(RunError::Cancelled);
        }
        match child
            .try_wait()
            .map_err(|error| RunError::Failed(format!("Failed waiting for worker: {error}")))?
        {
            Some(status) => {
                // The process can exit before the reader threads deliver its last
                // stderr lines. Keep those diagnostics instead of losing the cause.
                while let Ok(line) = line_rx.recv_timeout(Duration::from_millis(200)) {
                    if !line.trim().is_empty() {
                        log(events, line);
                    }
                }
                if status.success() {
                    return Ok(());
                }
                return Err(RunError::Failed(format!(
                    "Worker exited with status {status}"
                )));
            }
            None => thread::sleep(Duration::from_millis(80)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn library_path(command: &Command) -> Option<Option<OsString>> {
        command
            .get_envs()
            .find(|(key, _)| *key == "LD_LIBRARY_PATH")
            .map(|(_, value)| value.map(OsStr::to_os_string))
    }

    #[test]
    fn host_tools_restore_appimage_callers_library_path() {
        for original in [
            None,
            Some(OsString::new()),
            Some(OsString::from("/opt/cuda/lib:/opt/custom/lib")),
        ] {
            let mut command = Command::new("ffprobe");
            restore_host_environment(
                &mut command,
                true,
                original.clone(),
                Some("/tmp/appimage".into()),
                Some("/tmp/appimage/usr/lib".into()),
            );
            assert_eq!(library_path(&command), Some(original));
        }
    }

    #[test]
    fn old_appimages_strip_only_their_own_library_directories() {
        let mut command = Command::new("ffprobe");
        restore_host_environment(
            &mut command,
            false,
            None,
            Some("/tmp/appimage".into()),
            Some("/tmp/appimage/usr/lib:/opt/cuda/lib:/tmp/appimage-other/lib".into()),
        );
        assert_eq!(
            library_path(&command),
            Some(Some("/opt/cuda/lib:/tmp/appimage-other/lib".into()))
        );
    }

    #[test]
    fn ordinary_installs_keep_the_callers_environment() {
        let mut command = Command::new("ffprobe");
        restore_host_environment(
            &mut command,
            false,
            None,
            None,
            Some("/opt/custom/lib".into()),
        );
        assert_eq!(library_path(&command), None);
    }

    #[test]
    fn host_environment_is_inherited_by_grandchildren() {
        let mut command = Command::new("sh");
        command.env("LD_LIBRARY_PATH", "/tmp/appimage/usr/lib");
        restore_host_environment(&mut command, true, None, None, None);
        let output = command
            .args(["-c", "sh -c 'printf %s \"${LD_LIBRARY_PATH-unset}\"'"])
            .output()
            .unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout, b"unset");
    }

    #[test]
    fn failed_workers_keep_their_final_error_line() {
        let (events, receiver) = async_channel::unbounded();
        let cancel = Arc::new(AtomicBool::new(false));
        let mut command = host_command("sh");
        command.args(["-c", "echo 'ffprobe: symbol lookup error' >&2; exit 127"]);
        assert!(matches!(
            run_command(command, &events, &cancel),
            Err(RunError::Failed(_))
        ));
        assert!(std::iter::from_fn(|| receiver.try_recv().ok()).any(|event| matches!(event, JobEvent::Log(message) if message.contains("symbol lookup error"))));
    }
}
