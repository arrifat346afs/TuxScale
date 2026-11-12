mod assets;
mod engine;
mod preferences;
mod preview;
mod ui;

use async_channel::{Receiver, Sender};
use engine::{JobEvent, JobRequest};
use gpui::{
    App, AppContext, Application, Bounds, Context, PathPromptOptions, Window, WindowBounds,
    WindowOptions, px, size,
};
use std::{
    path::PathBuf,
    sync::{Arc, atomic::AtomicBool},
    thread,
};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    Video,
    Image,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Page {
    Upscale,
    Settings,
}

struct TuxScale {
    ui: ui::UiState,
    interface_scale: u16,
    mode: Mode,
    page: Page,
    batch: bool,
    backend: String,
    model: String,
    scale: u8,
    format: String,
    tta: bool,
    tile_size: u32,
    low_vram: bool,
    pytorch_encoder: String,
    pytorch_skip_duplicates: bool,
    image_quality: u8,
    custom_python_path: Option<PathBuf>,
    batch_size: u16,
    input: Option<PathBuf>,
    output: Option<PathBuf>,
    progress: f32,
    stage: String,
    logs: Vec<String>,
    completed_output: Option<PathBuf>,
    running: bool,
    cancellation: Option<Arc<AtomicBool>>,
}

impl Default for TuxScale {
    fn default() -> Self {
        let mut saved = preferences::load();
        let valid_formats: &[&str] = if saved.mode == "image" {
            &["png", "jpg", "webp"]
        } else {
            &[
                "mp4", "mkv", "webm", "avi", "mov", "mp3", "wav", "aac", "flac",
            ]
        };
        if !valid_formats.contains(&saved.format.as_str()) {
            saved.format = valid_formats[0].into();
        }
        let available_models = engine::models_for(&saved.backend);
        let model = if available_models.iter().any(|model| model == &saved.model) {
            saved.model
        } else {
            available_models
                .first()
                .cloned()
                .unwrap_or_else(|| "upscayl-standard-4x".into())
        };
        Self {
            ui: ui::UiState::default(),
            interface_scale: saved.interface_scale.clamp(60, 125),
            mode: if saved.mode == "image" {
                Mode::Image
            } else {
                Mode::Video
            },
            page: Page::Upscale,
            batch: saved.batch,
            backend: saved.backend,
            model,
            scale: saved.scale.clamp(1, 4),
            format: saved.format,
            tta: saved.tta,
            tile_size: saved.tile_size,
            low_vram: saved.low_vram,
            pytorch_encoder: saved.pytorch_encoder,
            pytorch_skip_duplicates: saved.pytorch_skip_duplicates,
            image_quality: saved.image_quality,
            custom_python_path: saved.custom_python_path,
            batch_size: saved.batch_size.max(1),
            input: None,
            output: saved.output,
            progress: 0.0,
            stage: "Ready".into(),
            logs: vec!["TuxScale is ready.".into()],
            completed_output: None,
            running: false,
            cancellation: None,
        }
    }
}

impl TuxScale {
    fn set_backend(&mut self, backend: &str) {
        self.backend = backend.into();
        let models = engine::models_for(backend);
        if !models.iter().any(|model| model == &self.model) {
            if let Some(model) = models.first() {
                self.model = model.clone();
            }
        }
        self.persist();
    }

    fn persist(&self) {
        preferences::save(&preferences::Preferences {
            interface_scale: self.interface_scale,
            mode: if self.mode == Mode::Image {
                "image"
            } else {
                "video"
            }
            .into(),
            batch: self.batch,
            backend: self.backend.clone(),
            model: self.model.clone(),
            scale: self.scale,
            format: self.format.clone(),
            output: self.output.clone(),
            tta: self.tta,
            tile_size: self.tile_size,
            low_vram: self.low_vram,
            pytorch_encoder: self.pytorch_encoder.clone(),
            pytorch_skip_duplicates: self.pytorch_skip_duplicates,
            image_quality: self.image_quality,
            custom_python_path: self.custom_python_path.clone(),
            batch_size: self.batch_size,
        });
    }
    fn pick_input(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let receiver = cx.prompt_for_paths(PathPromptOptions {
            files: !self.batch,
            directories: self.batch,
            multiple: false,
            prompt: Some(if self.batch {
                "Select media folder".into()
            } else {
                "Select source media".into()
            }),
        });
        cx.spawn_in(window, async move |view, cx| {
            if let Ok(Ok(Some(paths))) = receiver.await {
                view.update(cx, |this, cx| {
                    this.input = paths.into_iter().next();
                    this.completed_output = None;
                    this.stage = "Input selected".into();
                    cx.notify();
                })
                .ok();
            }
        })
        .detach();
    }

    fn pick_output(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let receiver = cx.prompt_for_paths(PathPromptOptions {
            files: false,
            directories: true,
            multiple: false,
            prompt: Some("Choose output folder".into()),
        });
        cx.spawn_in(window, async move |view, cx| {
            if let Ok(Ok(Some(paths))) = receiver.await {
                view.update(cx, |this, cx| {
                    this.output = paths.into_iter().next();
                    this.stage = "Output folder selected".into();
                    this.persist();
                    cx.notify();
                })
                .ok();
            }
        })
        .detach();
    }

    fn pick_python(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let receiver = cx.prompt_for_paths(PathPromptOptions {
            files: true,
            directories: false,
            multiple: false,
            prompt: Some("Select Python executable".into()),
        });
        cx.spawn_in(window, async move |view, cx| {
            if let Ok(Ok(Some(paths))) = receiver.await {
                view.update(cx, |this, cx| {
                    this.custom_python_path = paths.into_iter().next();
                    this.persist();
                    cx.notify();
                })
                .ok();
            }
        })
        .detach();
    }

    fn start_job(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.running {
            return;
        }
        let Some(input) = self.input.clone() else {
            self.logs
                .push("Select an input file or folder first.".into());
            self.stage = "Input required".into();
            cx.notify();
            return;
        };
        let request = JobRequest {
            mode: if self.mode == Mode::Image {
                "image"
            } else {
                "video"
            }
            .into(),
            input,
            output: self.output.clone(),
            backend: self.backend.clone(),
            model: self.model.clone(),
            scale: self.scale,
            format: self.format.clone(),
            tta: self.tta,
            tile_size: self.tile_size,
            low_vram: self.low_vram,
            pytorch_encoder: self.pytorch_encoder.clone(),
            pytorch_skip_duplicates: self.pytorch_skip_duplicates,
            image_quality: self.image_quality,
            custom_python_path: self.custom_python_path.clone(),
            batch_size: self.batch_size,
        };
        self.launch_task(request, window, cx);
    }

    fn start_installer(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let request = JobRequest {
            mode: "installer".into(),
            input: PathBuf::new(),
            output: None,
            backend: self.backend.clone(),
            model: self.model.clone(),
            scale: self.scale,
            format: self.format.clone(),
            tta: false,
            tile_size: 0,
            low_vram: false,
            pytorch_encoder: self.pytorch_encoder.clone(),
            pytorch_skip_duplicates: self.pytorch_skip_duplicates,
            image_quality: self.image_quality,
            custom_python_path: self.custom_python_path.clone(),
            batch_size: self.batch_size,
        };
        self.launch_task(request, window, cx);
    }

    fn launch_task(&mut self, request: JobRequest, window: &mut Window, cx: &mut Context<Self>) {
        let installer = request.mode == "installer";
        let cancel = Arc::new(AtomicBool::new(false));
        self.cancellation = Some(cancel.clone());
        self.running = true;
        self.progress = 0.0;
        self.stage = if installer {
            "Starting PyTorch installer"
        } else {
            "Starting"
        }
        .into();
        self.completed_output = None;
        self.logs.clear();
        let (sender, receiver): (Sender<JobEvent>, Receiver<JobEvent>) = async_channel::unbounded();
        thread::spawn(move || engine::run(request, sender, cancel));
        cx.spawn_in(window, async move |view, cx| {
            while let Ok(event) = receiver.recv().await {
                let finished = matches!(
                    &event,
                    JobEvent::Done(_) | JobEvent::Failed(_) | JobEvent::Cancelled
                );
                view.update(cx, |this, cx| {
                    match event {
                        JobEvent::Log(message) => {
                            this.logs.push(message);
                            if this.logs.len() > 500 {
                                this.logs.drain(0..100);
                            }
                        }
                        JobEvent::Progress { fraction, stage } => {
                            this.progress = fraction.clamp(0.0, 1.0);
                            this.stage = stage;
                        }
                        JobEvent::Done(path) => {
                            this.progress = 1.0;
                            if installer {
                                this.stage = "PyTorch environment ready".into();
                                this.logs.push(format!(
                                    "Python environment ready at {}",
                                    path.display()
                                ));
                            } else {
                                this.stage = "Complete".into();
                                this.completed_output = Some(path.clone());
                                this.logs.push(format!("Saved output: {}", path.display()));
                            }
                        }
                        JobEvent::Failed(message) => {
                            this.stage = "Failed".into();
                            this.logs.push(format!("Error: {message}"));
                        }
                        JobEvent::Cancelled => {
                            this.stage = "Cancelled".into();
                            this.logs.push("Upscaling cancelled.".into());
                        }
                    }
                    if finished {
                        this.running = false;
                        this.cancellation = None;
                    }
                    cx.notify();
                })
                .ok();
            }
        })
        .detach();
        cx.notify();
    }
}

fn main() {
    Application::new()
        .with_assets(assets::Assets)
        .run(|cx: &mut App| {
            let bounds = Bounds::centered(None, size(px(900.), px(670.)), cx);
            cx.open_window(
                WindowOptions {
                    window_min_size: Some(size(px(780.), px(560.))),
                    titlebar: Some(gpui::TitlebarOptions {
                        title: Some("TuxScale".into()),
                        ..Default::default()
                    }),
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    ..Default::default()
                },
                |window, cx| {
                    window.set_window_title("TuxScale");
                    window.set_app_id("io.github.arrifat346afs.TuxScale");
                    cx.new(|_| TuxScale::default())
                },
            )
            .expect("failed to open TuxScale window");
            cx.activate(true);
        });
}
