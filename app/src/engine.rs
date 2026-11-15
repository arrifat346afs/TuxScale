use async_channel::Sender;
use std::{
    ffi::{OsStr, OsString},
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
    time::Duration,
};

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

/// System tools and installed Python environments must use the host's libraries,
/// not the AppImage's Ubuntu libraries. Their children inherit this restored env.
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

fn restore_host_environment(
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

pub fn project_root() -> PathBuf {
    if let Some(installed_data) = std::env::current_exe()
        .ok()
        .and_then(|executable| {
            executable
                .parent()?
                .parent()
                .map(|prefix| prefix.join("share/tuxscale"))
        })
        .filter(|path| path.join("resources").is_dir())
    {
        return installed_data;
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or(Path::new("."))
        .to_path_buf()
}
fn models_dir() -> PathBuf {
    project_root().join("resources/models")
}

pub fn models_for(backend: &str) -> Vec<String> {
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
fn is_image(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "png" | "jpg" | "jpeg" | "webp" | "bmp" | "tif" | "tiff"
    )
}
fn is_video(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "mp4" | "webm" | "mkv" | "avi" | "mov" | "flv" | "wmv" | "ts" | "m4v" | "mpeg" | "mpg"
    )
}
fn media_files(path: &Path, image: bool) -> Result<Vec<PathBuf>, String> {
    if path.is_file() {
        return Ok(vec![path.to_path_buf()]);
    }
    let mut files = fs::read_dir(path)
        .map_err(|e| format!("Cannot read folder: {e}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|entry| {
            entry.is_file()
                && if image {
                    is_image(entry)
                } else {
                    is_video(entry)
                }
        })
        .collect::<Vec<_>>();
    files.sort();
    Ok(files)
}
fn safe_output(
    input: &Path,
    output: Option<&Path>,
    format: &str,
    suffix: &str,
) -> Result<PathBuf, String> {
    let folder = output
        .map(Path::to_path_buf)
        .unwrap_or_else(|| input.parent().unwrap_or(Path::new(".")).join("upscaled"));
    fs::create_dir_all(&folder).map_err(|e| format!("Cannot create output folder: {e}"))?;
    let name = input.file_stem().unwrap_or_default().to_string_lossy();
    let extension = format.trim_start_matches('.');
    let mut candidate = folder.join(format!("{name}{suffix}.{extension}"));
    let mut index = 1;
    while candidate.exists() || candidate == input {
        candidate = folder.join(format!("{name}{suffix}_{index}.{extension}"));
        index += 1;
    }
    Ok(candidate)
}

pub fn runtime_summary(custom_python: Option<&Path>) -> String {
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

fn check_media_tool(program: &str) -> Result<(), String> {
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

pub fn run(request: JobRequest, events: Sender<JobEvent>, cancel: Arc<AtomicBool>) {
    let result = run_inner(&request, &events, &cancel);
    let event = match result {
        Ok(path) => JobEvent::Done(path),
        Err(RunError::Cancelled) => JobEvent::Cancelled,
        Err(RunError::Failed(error)) => JobEvent::Failed(error),
    };
    let _ = events.send_blocking(event);
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
fn log(events: &Sender<JobEvent>, message: impl Into<String>) {
    let _ = events.send_blocking(JobEvent::Log(message.into()));
}
fn progress(events: &Sender<JobEvent>, fraction: f32, stage: impl Into<String>) {
    let _ = events.send_blocking(JobEvent::Progress {
        fraction,
        stage: stage.into(),
    });
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

fn install_pytorch(
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

fn run_images(
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

fn extract_audio(
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

fn run_ncnn_image(
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

fn python_command(custom_path: Option<&Path>) -> String {
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
fn config_dir() -> PathBuf {
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
        .unwrap_or_else(|| PathBuf::from("."))
}
fn run_pytorch_image(
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

fn run_videos(
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

fn run_pytorch_video(
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

fn run_ncnn_video(
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

fn choose_backend(preference: &str) -> &'static str {
    if preference == "PyTorch" {
        "pytorch"
    } else {
        "ncnn"
    }
}

fn run_command(
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
