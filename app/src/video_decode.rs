//! Cancellable, bounded FFmpeg decoding for the native, muted video preview.
use async_channel::{Receiver, Sender};
use std::{
    io::{Read, Result as IoResult},
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

pub(crate) const WIDTH: u32 = 960;
pub(crate) const HEIGHT: u32 = 540;
const FPS: f64 = 24.;

#[derive(Clone, Copy, Debug)]
pub(crate) struct Metadata {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
}

pub(crate) enum Event {
    Ready(Metadata),
    Frame { pixels: Vec<u8>, position: f64 },
    Ended,
    Error(String),
}

#[derive(Default)]
struct Control {
    cancelled: AtomicBool,
    child: Mutex<Option<Child>>,
}

impl Control {
    fn terminate(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    fn wait(&self) -> Result<ExitStatus, String> {
        loop {
            if self.cancelled.load(Ordering::Acquire) {
                return Err("Preview cancelled".into());
            }
            {
                let mut slot = self.child.lock().unwrap();
                let child = slot.as_mut().ok_or("Preview cancelled")?;
                if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                    slot.take();
                    return Ok(status);
                }
            }
            thread::sleep(Duration::from_millis(5));
        }
    }
}

/// Owns both process and delivery lifetime. Dropping a view or replacing a video
/// closes the bounded queue first, then kills/reaps any decoder or probe process.
pub(crate) struct Session {
    control: Arc<Control>,
    sender: Sender<Event>,
    worker: Option<JoinHandle<()>>,
}

impl Drop for Session {
    fn drop(&mut self) {
        self.control.cancelled.store(true, Ordering::Release);
        self.sender.close();
        self.control.terminate();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

pub(crate) fn start(
    path: PathBuf,
    start_seconds: f64,
    playing: bool,
) -> (Receiver<Event>, Session) {
    let (sender, receiver) = async_channel::bounded(1);
    let control = Arc::new(Control::default());
    let worker_control = control.clone();
    let worker_sender = sender.clone();
    let worker = thread::spawn(move || {
        let result = decode(
            &path,
            start_seconds,
            playing,
            &worker_control,
            &worker_sender,
        );
        worker_control.terminate();
        if let Err(message) = result {
            if !worker_control.cancelled.load(Ordering::Acquire) {
                let _ = worker_sender.send_blocking(Event::Error(message));
            }
        }
        worker_sender.close();
    });
    (
        receiver,
        Session {
            control,
            sender,
            worker: Some(worker),
        },
    )
}

fn launch(
    command: &mut Command,
    name: &str,
    control: &Control,
) -> Result<(std::process::ChildStdout, JoinHandle<String>), String> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Cannot start {name}: {e}. Install FFmpeg and FFprobe."))?;
    let stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    {
        let mut slot = control.child.lock().unwrap();
        if control.cancelled.load(Ordering::Acquire) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Preview cancelled".into());
        }
        *slot = Some(child);
    }
    // Always drain diagnostics so the child cannot block on a full stderr pipe.
    let diagnostics = thread::spawn(move || {
        let mut tail = Vec::new();
        let mut buffer = [0; 4096];
        while let Ok(count) = stderr.read(&mut buffer) {
            if count == 0 {
                break;
            }
            tail.extend_from_slice(&buffer[..count]);
            if tail.len() > 16384 {
                tail.drain(..tail.len() - 16384);
            }
        }
        String::from_utf8_lossy(&tail).trim().to_string()
    });
    Ok((stdout, diagnostics))
}

fn probe(path: &Path, control: &Control) -> Result<Metadata, String> {
    let mut command = crate::engine::host_command("ffprobe");
    command
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,duration:format=duration",
            "-of",
            "json",
        ])
        .arg(path);
    let (stdout, diagnostics) = launch(&mut command, "ffprobe", control)?;
    let mut bytes = Vec::new();
    let read = stdout.take(1024 * 1024).read_to_end(&mut bytes);
    if read.is_err() || bytes.len() == 1024 * 1024 {
        control.terminate();
    }
    let status = control.wait();
    let stderr = diagnostics.join().unwrap_or_default();
    read.map_err(|e| format!("Reading video metadata failed: {e}"))?;
    if !status?.success() {
        return Err(format!("FFprobe could not read this video: {stderr}"));
    }
    parse_metadata(&bytes)
}

fn parse_metadata(bytes: &[u8]) -> Result<Metadata, String> {
    let value: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|e| format!("Invalid video metadata: {e}"))?;
    let stream = value["streams"]
        .as_array()
        .and_then(|s| s.first())
        .ok_or("This file has no video stream")?;
    let duration = [&value["format"]["duration"], &stream["duration"]]
        .into_iter()
        .filter_map(|v| {
            v.as_str()
                .and_then(|s| s.parse::<f64>().ok())
                .or_else(|| v.as_f64())
        })
        .find(|d| d.is_finite() && *d > 0.)
        .ok_or("This video has no readable duration")?;
    let width = stream["width"]
        .as_u64()
        .and_then(|v| u32::try_from(v).ok())
        .unwrap_or(0);
    let height = stream["height"]
        .as_u64()
        .and_then(|v| u32::try_from(v).ok())
        .unwrap_or(0);
    if width == 0 || height == 0 {
        return Err("This video has no readable frame size".into());
    }
    Ok(Metadata {
        duration,
        width,
        height,
    })
}

fn decode(
    path: &Path,
    start_seconds: f64,
    playing: bool,
    control: &Control,
    sender: &Sender<Event>,
) -> Result<(), String> {
    let metadata = probe(path, control)?;
    sender
        .send_blocking(Event::Ready(metadata))
        .map_err(|_| "Preview closed")?;
    let position = if start_seconds.is_finite() {
        start_seconds.clamp(0., (metadata.duration - 1. / FPS).max(0.))
    } else {
        0.
    };
    let mut command = crate::engine::host_command("ffmpeg");
    command.args(["-v", "error", "-nostdin", "-ss", &format!("{position:.6}"), "-i"])
        .arg(path)
        .args(["-map", "0:v:0", "-an", "-sn", "-dn", "-vf",
            "fps=24,scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1",
            "-pix_fmt", "bgra", "-threads", "1"]);
    if !playing {
        command.args(["-frames:v", "1"]);
    }
    command.args(["-f", "rawvideo", "pipe:1"]);
    let (mut stdout, diagnostics) = launch(&mut command, "ffmpeg", control)?;
    let started = Instant::now();
    let mut index = 0_u64;
    let result = (|| -> Result<(), String> {
        loop {
            let mut pixels = vec![0_u8; (WIDTH * HEIGHT * 4) as usize];
            let count = read_frame(&mut stdout, &mut pixels).map_err(|e| e.to_string())?;
            if count == 0 {
                break;
            }
            if count != pixels.len() {
                return Err("FFmpeg returned an incomplete preview frame".into());
            }
            if control.cancelled.load(Ordering::Acquire) {
                return Err("Preview cancelled".into());
            }
            // Keep at most one queued frame and decode no faster than playback.
            let target = Duration::from_secs_f64(index as f64 / FPS);
            while started.elapsed() < target {
                if control.cancelled.load(Ordering::Acquire) {
                    return Err("Preview cancelled".into());
                }
                thread::sleep(
                    (target - started.elapsed().min(target)).min(Duration::from_millis(10)),
                );
            }
            sender
                .send_blocking(Event::Frame {
                    pixels,
                    position: (position + index as f64 / FPS).min(metadata.duration),
                })
                .map_err(|_| "Preview closed")?;
            index += 1;
        }
        Ok(())
    })();
    if result.is_err() {
        control.terminate();
    }
    let status = control.wait();
    let stderr = diagnostics.join().unwrap_or_default();
    result?;
    if !status?.success() {
        return Err(format!("FFmpeg could not decode this video: {stderr}"));
    }
    if index == 0 {
        return Err(format!("No preview frame could be decoded. {stderr}"));
    }
    sender
        .send_blocking(Event::Ended)
        .map_err(|_| "Preview closed")?;
    Ok(())
}

fn read_frame(reader: &mut impl Read, bytes: &mut [u8]) -> IoResult<usize> {
    let mut filled = 0;
    while filled < bytes.len() {
        match reader.read(&mut bytes[filled..]) {
            Ok(0) => break,
            Ok(count) => filled += count,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }
    Ok(filled)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_rejects_audio_only_and_invalid_duration() {
        assert!(parse_metadata(br#"{"streams":[],"format":{"duration":"10"}}"#).is_err());
        assert!(
            parse_metadata(
                br#"{"streams":[{"width":100,"height":80}],"format":{"duration":"NaN"}}"#
            )
            .is_err()
        );
        let metadata = parse_metadata(
            br#"{"streams":[{"width":100,"height":80,"duration":"2"}],"format":{}}"#,
        )
        .unwrap();
        assert_eq!(
            (metadata.width, metadata.height, metadata.duration),
            (100, 80, 2.)
        );
    }

    #[test]
    #[ignore = "requires FFmpeg and FFprobe on PATH"]
    fn decodes_seeks_and_cancels_with_a_full_queue() {
        let path =
            std::env::temp_dir().join(format!("tuxscale-video-test-{}.mkv", std::process::id()));
        let status = crate::engine::host_command("ffmpeg")
            .args([
                "-v",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=red:size=160x120:rate=24:duration=2",
                "-c:v",
                "ffv1",
            ])
            .arg(&path)
            .status()
            .unwrap();
        assert!(status.success());
        let (receiver, session) = start(path.clone(), 1., false);
        let metadata = match receiver.recv_blocking().unwrap() {
            Event::Ready(m) => m,
            _ => panic!("metadata"),
        };
        assert!((metadata.duration - 2.).abs() < 0.1);
        match receiver.recv_blocking().unwrap() {
            Event::Frame { pixels, position } => {
                assert_eq!(pixels.len(), (WIDTH * HEIGHT * 4) as usize);
                assert!((position - 1.).abs() < 0.01);
                // Center is red in BGRA; letterbox edges are black.
                let center = ((HEIGHT / 2 * WIDTH + WIDTH / 2) * 4) as usize;
                assert!(pixels[center + 2] > 200 && pixels[center] < 20);
                assert_eq!(&pixels[0..3], &[0, 0, 0]);
            }
            Event::Error(e) => panic!("{e}"),
            _ => panic!("frame"),
        }
        assert!(matches!(receiver.recv_blocking().unwrap(), Event::Ended));
        drop(session);
        let (_receiver, session) = start(path.clone(), 0., true);
        thread::sleep(Duration::from_millis(500));
        let start = Instant::now();
        drop(session);
        assert!(start.elapsed() < Duration::from_secs(2));
        std::fs::remove_file(path).unwrap();
    }
}
