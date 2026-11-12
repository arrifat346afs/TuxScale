use super::*;
use gpui::{div, img, prelude::*, *};
use std::{cell::Cell, rc::Rc};

// sRGB equivalents of the original renderer's dark OKLCH theme.
const BG: u32 = 0x0f1419;
const CARD: u32 = 0x161c24;
const POPOVER: u32 = 0x1c232d;
const SECONDARY: u32 = 0x1e2630;
const BORDER: u32 = 0x28313d;
const TEXT: u32 = 0xe5e9ee;
const MUTED: u32 = 0x8590a0;
const PRIMARY: u32 = 0x7ab0d0;

#[derive(Clone, Copy, PartialEq)]
enum Field {
    Model,
    Backend,
    Format,
    Tile,
    Encoder,
    InterfaceScale,
}
#[derive(Clone)]
struct Menu {
    field: Field,
    options: Vec<(String, String)>,
    selected: usize,
}
#[derive(Default)]
pub struct UiState {
    pub(super) preview: crate::preview::PreviewState,
    focus: Option<FocusHandle>,
    menu: Option<Menu>,
    show_logs: bool,
    status: String,
}

// Use the same rem basis for fixed dimensions and spacing, so interface zoom
// changes menus, icons, sliders, and text together without changing display DPI.
fn logical(value: f32) -> Rems {
    rems(value / 16.)
}

fn icon(name: &'static str, size: f32) -> impl IntoElement {
    svg()
        .path(name)
        .size(logical(size))
        .text_color(rgb(MUTED))
        .flex_shrink_0()
}
fn caption(text: impl Into<SharedString>) -> Div {
    div().text_xs().text_color(rgb(MUTED)).child(text.into())
}
fn panel() -> Div {
    div()
        .w_full()
        .flex()
        .flex_col()
        .gap_3()
        .p_5()
        .rounded_md()
        .border_1()
        .border_color(rgb(BORDER))
        .bg(rgb(POPOVER))
}
fn button(
    label: &'static str,
    primary: bool,
    disabled: bool,
    click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    div()
        .id(label)
        .w_full()
        .h(logical(36.))
        .flex()
        .items_center()
        .justify_center()
        .rounded_full()
        .bg(rgb(if primary { PRIMARY } else { SECONDARY }))
        .text_color(rgb(if primary { BG } else { TEXT }))
        .text_sm()
        .opacity(if disabled { 0.45 } else { 1. })
        .cursor_pointer()
        .hover(|s| s.bg(rgb(if primary { 0x90c4de } else { BORDER })))
        .on_click(move |event, window, cx| {
            if !disabled {
                click(event, window, cx);
            }
        })
        .gap_2()
        .when_some(
            match label {
                "Select Video" => Some("file-video"),
                "Select Image" => Some("file-image"),
                "Select Folder" => Some("folder-open"),
                "Set Output Folder" => Some("folder"),
                "Upscale" => Some("rocket"),
                _ => None,
            },
            |d, name| d.child(icon(name, 16.)),
        )
        .child(label)
}
fn tab(
    label: &'static str,
    active: bool,
    click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    div()
        .id(label)
        .px_4()
        .py_2()
        .rounded_md()
        .text_sm()
        .cursor_pointer()
        .bg(rgb(if active { SECONDARY } else { CARD }))
        .text_color(rgb(if active { TEXT } else { MUTED }))
        .on_click(click)
        .flex()
        .items_center()
        .gap_2()
        .when_some(
            match label {
                "Videos" => Some("film"),
                "Images" => Some("image"),
                _ => None,
            },
            |d, name| d.child(icon(name, 14.)),
        )
        .child(label)
}
fn toggle(
    label: &'static str,
    enabled: bool,
    disabled: bool,
    click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    div()
        .id(label)
        .flex()
        .gap_2()
        .items_center()
        .text_sm()
        .cursor_pointer()
        .opacity(if disabled { 0.45 } else { 1. })
        .on_click(move |e, w, c| {
            if !disabled {
                click(e, w, c);
            }
        })
        .child(
            div()
                .w(logical(32.))
                .h(logical(18.))
                .p(logical(2.))
                .rounded_full()
                .bg(rgb(if enabled { PRIMARY } else { BORDER }))
                .flex()
                .when(enabled, |d| d.justify_end())
                .child(div().size(logical(14.)).rounded_full().bg(rgb(TEXT))),
        )
        .child(label)
}
fn options(values: &[(&str, &str)]) -> Vec<(String, String)> {
    values
        .iter()
        .map(|(v, l)| (v.to_string(), l.to_string()))
        .collect()
}

impl TuxScale {
    fn set_mode(&mut self, mode: Mode, cx: &mut Context<Self>) {
        if self.running || self.mode == mode {
            return;
        }
        self.mode = mode;
        self.input = None;
        self.completed_output = None;
        self.format = if mode == Mode::Image { "png" } else { "mp4" }.into();
        self.ui.menu = None;
        self.persist();
        cx.notify();
    }
    fn select_option(&mut self, field: Field, value: &str, cx: &mut Context<Self>) {
        match field {
            Field::Model => self.model = value.into(),
            Field::Backend => self.set_backend(value),
            Field::Format => self.format = value.into(),
            Field::Tile => self.tile_size = value.parse().unwrap_or(0),
            Field::Encoder => self.pytorch_encoder = value.into(),
            Field::InterfaceScale => {
                self.interface_scale = value.parse::<u16>().unwrap_or(80).clamp(60, 125)
            }
        }
        self.ui.menu = None;
        self.persist();
        cx.notify();
    }
    fn dropdown(
        &self,
        id: &'static str,
        field: Field,
        value: String,
        items: Vec<(String, String)>,
        cx: &Context<Self>,
    ) -> AnyElement {
        let selected = items.iter().position(|(v, _)| *v == value).unwrap_or(0);
        let label = items.get(selected).map(|(_, l)| l.clone()).unwrap_or(value);
        let open = self.ui.menu.as_ref().is_some_and(|m| m.field == field);
        let keyboard_items = items.clone();
        let mut container = div().relative().w_full().child(
            div()
                .id(id)
                .focusable()
                .tab_index(0)
                .on_key_down(cx.listener(move |this, event: &KeyDownEvent, window, cx| {
                    if this.running {
                        return;
                    }
                    if ["enter", "space", "down"].contains(&event.keystroke.key.as_str()) {
                        this.ui.menu = Some(Menu {
                            field,
                            options: keyboard_items.clone(),
                            selected,
                        });
                        if let Some(focus) = &this.ui.focus {
                            window.focus(focus);
                        }
                        cx.stop_propagation();
                        cx.notify();
                    }
                }))
                .h(logical(40.))
                .w_full()
                .px_3()
                .flex()
                .items_center()
                .justify_between()
                .rounded_xl()
                .border_1()
                .border_color(rgb(if open { PRIMARY } else { BORDER }))
                .bg(rgb(SECONDARY))
                .text_xs()
                .cursor_pointer()
                .opacity(if self.running { 0.5 } else { 1. })
                .on_click(cx.listener(move |this, _, window, cx| {
                    if this.running {
                        return;
                    }
                    this.ui.menu = if open {
                        None
                    } else {
                        Some(Menu {
                            field,
                            options: items.clone(),
                            selected,
                        })
                    };
                    if let Some(focus) = &this.ui.focus {
                        window.focus(focus);
                    }
                    cx.notify();
                }))
                .child(
                    div()
                        .flex_1()
                        .overflow_hidden()
                        .text_ellipsis()
                        .child(label),
                )
                .child(icon("chevron-down", 14.)),
        );
        if let Some(menu) = self.ui.menu.as_ref().filter(|m| m.field == field) {
            let menu_view =
                div()
                    .id("select-options")
                    .w(logical(268.))
                    .max_h(logical(280.))
                    .overflow_y_scroll()
                    .p_1()
                    .rounded_xl()
                    .border_1()
                    .border_color(rgb(BORDER))
                    .bg(rgb(POPOVER))
                    .shadow_lg()
                    .on_mouse_down_out(cx.listener(|this, _, _, cx| {
                        this.ui.menu = None;
                        cx.notify();
                    }))
                    .children(menu.options.iter().enumerate().map(|(i, (value, label))| {
                        let value = value.clone();
                        div()
                            .id(("option", i))
                            .px_3()
                            .py_2()
                            .rounded_lg()
                            .flex()
                            .justify_between()
                            .gap_2()
                            .text_xs()
                            .bg(rgb(if i == menu.selected {
                                SECONDARY
                            } else {
                                POPOVER
                            }))
                            .hover(|s| s.bg(rgb(BORDER)))
                            .cursor_pointer()
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.select_option(field, &value, cx)
                            }))
                            .child(label.clone())
                            .when(i == selected, |d| d.child(icon("check", 14.)))
                    }));
            container = container.child(
                deferred(
                    anchored()
                        .offset(point(px(0.), px(6. * self.interface_scale as f32 / 100.)))
                        .snap_to_window()
                        .child(menu_view),
                )
                .with_priority(10),
            );
        }
        container.into_any_element()
    }
    fn slider(&self, quality: bool, cx: &Context<Self>) -> AnyElement {
        let (value, min, max) = if quality {
            (self.image_quality as f32, 1., 100.)
        } else {
            (self.scale as f32, 1., 4.)
        };
        let bounds = Rc::new(Cell::new(Bounds::<Pixels>::default()));
        let paint_bounds = bounds.clone();
        let down_bounds = bounds.clone();
        let disabled = self.running;
        div()
            .id(if quality {
                "quality-slider"
            } else {
                "scale-slider"
            })
            .relative()
            .w_full()
            .h(logical(48.))
            .cursor_pointer()
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                    if disabled {
                        return;
                    }
                    let b = down_bounds.get();
                    let f = ((event.position.x - b.origin.x) / b.size.width).clamp(0., 1.);
                    let value = (min + f * (max - min)).round() as u8;
                    if quality {
                        this.image_quality = value;
                    } else {
                        this.scale = value;
                    }
                    this.persist();
                    cx.notify();
                }),
            )
            .on_mouse_move(cx.listener(move |this, event: &MouseMoveEvent, _, cx| {
                if disabled || event.pressed_button != Some(MouseButton::Left) {
                    return;
                }
                let b = bounds.get();
                let f = ((event.position.x - b.origin.x) / b.size.width).clamp(0., 1.);
                let value = (min + f * (max - min)).round() as u8;
                if quality {
                    this.image_quality = value;
                } else {
                    this.scale = value;
                }
                this.persist();
                cx.notify();
            }))
            .child(
                canvas(
                    move |bounds, _, _| {
                        paint_bounds.set(bounds);
                    },
                    |bounds, _, window, _| {
                        window.paint_quad(fill(
                            Bounds::new(
                                point(
                                    bounds.origin.x,
                                    bounds.origin.y + window.rem_size() * (22. / 16.),
                                ),
                                size(bounds.size.width, window.rem_size() * 0.25),
                            ),
                            rgb(BORDER),
                        ));
                    },
                )
                .size_full(),
            )
            .child(
                div()
                    .absolute()
                    .left_0()
                    .top(logical(22.))
                    .h(logical(4.))
                    .w(relative((value - min) / (max - min)))
                    .bg(rgb(PRIMARY)),
            )
            .child(
                div()
                    .absolute()
                    .left(relative((value - min) / (max - min)))
                    .top(logical(17.))
                    .ml(logical(-7.))
                    .size(logical(14.))
                    .rounded_full()
                    .bg(rgb(PRIMARY)),
            )
            .into_any_element()
    }
    fn refresh_status(&mut self, cx: &mut Context<Self>) {
        self.ui.status = "Checking engines…".into();
        let (tx, rx) = async_channel::bounded(1);
        let python = self.custom_python_path.clone();
        thread::spawn(move || {
            let _ = tx.send_blocking(engine::runtime_summary(python.as_deref()));
        });
        cx.spawn(async move |this, cx| {
            if let Ok(status) = rx.recv().await {
                let _ = this.update(cx, |this, cx| {
                    this.ui.status = status;
                    cx.notify();
                });
            }
        })
        .detach();
    }
    fn upscale_controls(&self, cx: &Context<Self>) -> AnyElement {
        let image = self.mode == Mode::Image;
        let model_options = engine::models_for(&self.backend)
            .into_iter()
            .map(|m| {
                let mut label = m.replace('-', " ").to_uppercase();
                if m.to_lowercase().contains("ultrasharpv2") || m.to_lowercase().contains("dat") {
                    label.push_str(" (Image only - slow)");
                }
                (m, label)
            })
            .collect();
        div()
            .flex()
            .flex_col()
            .gap_6()
            .child(toggle(
                if image {
                    "Batch Upscale (Folder)"
                } else {
                    "Batch Upscale"
                },
                self.batch,
                self.running,
                cx.listener(|this, _, _, cx| {
                    this.batch = !this.batch;
                    this.input = None;
                    this.completed_output = None;
                    this.persist();
                    cx.notify();
                }),
            ))
            .child(
                panel()
                    .child(caption("STEP 1"))
                    .child(button(
                        if self.batch {
                            "Select Folder"
                        } else if image {
                            "Select Image"
                        } else {
                            "Select Video"
                        },
                        false,
                        self.running,
                        cx.listener(|this, _, w, cx| this.pick_input(w, cx)),
                    ))
                    .when_some(self.input.as_ref(), |d, p| {
                        d.child(caption(
                            p.file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string(),
                        ))
                    }),
            )
            .child(
                panel()
                    .gap_4()
                    .child(
                        div()
                            .flex()
                            .justify_between()
                            .child(caption("STEP 2"))
                            .child(caption(if self.backend == "PyTorch" {
                                "PyTorch"
                            } else {
                                "NCNN"
                            })),
                    )
                    .child(caption("Select AI Model"))
                    .child(self.dropdown(
                        "model",
                        Field::Model,
                        self.model.clone(),
                        model_options,
                        cx,
                    ))
                    .when(self.backend != "PyTorch", |d| {
                        d.child(toggle(
                            "TTA Mode",
                            self.tta,
                            self.running,
                            cx.listener(|this, _, _, cx| {
                                this.tta = !this.tta;
                                this.persist();
                                cx.notify();
                            }),
                        ))
                    })
                    .child(
                        div()
                            .p_2()
                            .border_1()
                            .border_color(rgb(BORDER))
                            .rounded_sm()
                            .child(
                                div()
                                    .flex()
                                    .justify_between()
                                    .child(caption(if image {
                                        "Image Scale"
                                    } else {
                                        "Video Scale"
                                    }))
                                    .child(caption(format!("{}x", self.scale))),
                            )
                            .child(self.slider(false, cx)),
                    ),
            )
            .child(
                panel()
                    .child(caption("STEP 3"))
                    .child(caption("Defaults to 'upscaled' subfolder"))
                    .child(button(
                        "Set Output Folder",
                        false,
                        self.running,
                        cx.listener(|this, _, w, cx| this.pick_output(w, cx)),
                    ))
                    .when_some(self.output.as_ref(), |d, p| {
                        d.child(caption(p.display().to_string()))
                    }),
            )
            .child(panel().child(caption("STEP 4")).child(button(
                if self.running {
                    "Cancel processing"
                } else {
                    "Upscale"
                },
                true,
                !self.running && self.input.is_none(),
                cx.listener(|this, _, w, cx| {
                    if let Some(cancel) = &this.cancellation {
                        cancel.store(true, std::sync::atomic::Ordering::SeqCst);
                        this.stage = "Cancelling…".into();
                        cx.notify();
                    } else {
                        this.start_job(w, cx);
                    }
                }),
            )))
            .into_any_element()
    }
    fn settings_controls(&self, cx: &Context<Self>) -> AnyElement {
        let image = self.mode == Mode::Image;
        let formats = if image {
            options(&[
                ("png", "PNG (Lossless)"),
                ("jpg", "JPG (Compressed)"),
                ("webp", "WebP"),
            ])
        } else {
            options(&[
                ("mp4", "MP4 (H.264)"),
                ("webm", "WebM (VP9)"),
                ("mkv", "MKV (H.264)"),
                ("avi", "AVI"),
                ("mov", "MOV (H.264)"),
                ("mp3", "MP3"),
                ("wav", "WAV"),
                ("aac", "AAC"),
                ("flac", "FLAC"),
            ])
        };
        div()
            .flex()
            .flex_col()
            .gap_5()
            .child(
                panel()
                    .child(caption("APPEARANCE"))
                    .child(caption("Interface Scale"))
                    .child(self.dropdown(
                        "interface-scale",
                        Field::InterfaceScale,
                        self.interface_scale.to_string(),
                        options(&[
                            ("60", "60%"),
                            ("75", "75%"),
                            ("80", "80% (Default)"),
                            ("90", "90%"),
                            ("100", "100%"),
                            ("110", "110%"),
                            ("125", "125%"),
                        ]),
                        cx,
                    )),
            )
            .child(
                panel()
                    .child(caption("AI BACKEND"))
                    .child(self.dropdown(
                        "backend",
                        Field::Backend,
                        self.backend.clone(),
                        options(&[
                            ("Auto", "Auto (Recommended)"),
                            ("NCNN", "NCNN (Vulkan)"),
                            ("PyTorch", "PyTorch (CUDA)"),
                        ]),
                        cx,
                    ))
                    .child(caption(self.ui.status.clone()))
                    .child(button(
                        "Refresh engine status",
                        false,
                        false,
                        cx.listener(|this, _, _, cx| this.refresh_status(cx)),
                    ))
                    .child(button(
                        "Choose Python executable",
                        false,
                        self.running,
                        cx.listener(|this, _, w, cx| this.pick_python(w, cx)),
                    ))
                    .child(caption(
                        self.custom_python_path
                            .as_ref()
                            .map(|p| p.display().to_string())
                            .unwrap_or("Auto-detect Python".into()),
                    ))
                    .child(button(
                        "Install PyTorch CUDA environment",
                        false,
                        self.running,
                        cx.listener(|this, _, w, cx| this.start_installer(w, cx)),
                    )),
            )
            .child(
                panel()
                    .child(caption("EXPORT SETTINGS"))
                    .child(caption(if image {
                        "Image Format"
                    } else {
                        "Export Format"
                    }))
                    .child(self.dropdown("format", Field::Format, self.format.clone(), formats, cx))
                    .when(image && self.format != "png", |d| {
                        d.child(caption(format!("Quality  {}%", self.image_quality)))
                            .child(self.slider(true, cx))
                    }),
            )
            .when(self.backend != "PyTorch", |d| {
                d.child(
                    panel()
                        .child(caption("NCNN SETTINGS"))
                        .child(caption("Tile Size"))
                        .child(self.dropdown(
                            "tile",
                            Field::Tile,
                            self.tile_size.to_string(),
                            options(&[
                                ("0", "Auto / No Tiling"),
                                ("256", "256px"),
                                ("512", "512px"),
                                ("1024", "1024px"),
                            ]),
                            cx,
                        ))
                        .child(caption("Smaller tiles reduce VRAM usage on large inputs."))
                        .child(caption(format!("Frames per batch: {}", self.batch_size)))
                        .child(
                            div()
                                .flex()
                                .gap_2()
                                .child(button(
                                    "−",
                                    false,
                                    self.running,
                                    cx.listener(|this, _, _, cx| {
                                        this.batch_size = this.batch_size.saturating_sub(1).max(1);
                                        this.persist();
                                        cx.notify();
                                    }),
                                ))
                                .child(button(
                                    "+",
                                    false,
                                    self.running,
                                    cx.listener(|this, _, _, cx| {
                                        this.batch_size = (this.batch_size + 1).min(100);
                                        this.persist();
                                        cx.notify();
                                    }),
                                )),
                        ),
                )
            })
            .child(
                panel()
                    .child(caption("PYTORCH SETTINGS"))
                    .child(self.dropdown(
                        "encoder",
                        Field::Encoder,
                        self.pytorch_encoder.clone(),
                        options(&[
                            ("auto", "Auto (NVENC / CPU)"),
                            ("nvenc", "NVENC (Hardware)"),
                            ("cpu", "CPU (libx264)"),
                        ]),
                        cx,
                    ))
                    .child(toggle(
                        "Low VRAM Mode",
                        self.low_vram,
                        self.running,
                        cx.listener(|this, _, _, cx| {
                            this.low_vram = !this.low_vram;
                            this.persist();
                            cx.notify();
                        }),
                    ))
                    .child(toggle(
                        "Skip Duplicate Frames",
                        self.pytorch_skip_duplicates,
                        self.running,
                        cx.listener(|this, _, _, cx| {
                            this.pytorch_skip_duplicates = !this.pytorch_skip_duplicates;
                            this.persist();
                            cx.notify();
                        }),
                    )),
            )
            .into_any_element()
    }
}

impl Render for TuxScale {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        window.set_rem_size(px(16. * self.interface_scale as f32 / 100.));
        if self.ui.focus.is_none() {
            let f = cx.focus_handle();
            window.focus(&f);
            self.ui.focus = Some(f);
        }
        let image = self.mode == Mode::Image;
        let settings = self.page == Page::Settings;
        let controls = if settings {
            self.settings_controls(cx)
        } else {
            self.upscale_controls(cx)
        };
        div()
            .id("tuxscale")
            .on_mouse_move(cx.listener(|this, event: &MouseMoveEvent, _, cx| {
                if this.ui.preview.dragging {
                    if event.pressed_button == Some(MouseButton::Left) {
                        this.ui.preview.move_to(event.position);
                    } else {
                        this.ui.preview.dragging = false;
                    }
                    cx.notify();
                }
            }))
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|this, _, _, cx| {
                    if this.ui.preview.dragging {
                        this.ui.preview.dragging = false;
                        cx.notify();
                    }
                }),
            )
            .on_mouse_up_out(
                MouseButton::Left,
                cx.listener(|this, _, _, cx| {
                    this.ui.preview.dragging = false;
                    cx.notify();
                }),
            )
            .track_focus(self.ui.focus.as_ref().unwrap())
            .size_full()
            .flex()
            .bg(rgb(BG))
            .text_color(rgb(TEXT))
            .font_family("Geist")
            .text_sm()
            .on_key_down(cx.listener(|this, event: &KeyDownEvent, _, cx| {
                let key = event.keystroke.key.as_str();
                if event.keystroke.modifiers.control && key == "l" {
                    this.ui.show_logs = !this.ui.show_logs;
                    cx.notify();
                    return;
                }
                let Some(menu) = this.ui.menu.as_mut() else {
                    return;
                };
                if key == "escape" || key == "tab" {
                    this.ui.menu = None;
                } else if !menu.options.is_empty() {
                    match key {
                        "down" => menu.selected = (menu.selected + 1) % menu.options.len(),
                        "up" => {
                            menu.selected =
                                (menu.selected + menu.options.len() - 1) % menu.options.len()
                        }
                        "home" => menu.selected = 0,
                        "end" => menu.selected = menu.options.len() - 1,
                        "enter" | "space" => {
                            let f = menu.field;
                            let v = menu.options[menu.selected].0.clone();
                            this.select_option(f, &v, cx);
                        }
                        _ => {
                            if key.len() == 1 {
                                if let Some(i) = menu
                                    .options
                                    .iter()
                                    .position(|(_, l)| l.to_lowercase().starts_with(key))
                                {
                                    menu.selected = i;
                                }
                            }
                        }
                    }
                }
                cx.notify();
            }))
            .child(
                div()
                    .w(logical(352.))
                    .flex_shrink_0()
                    .h_full()
                    .flex()
                    .flex_col()
                    .bg(rgb(CARD))
                    .border_r_1()
                    .border_color(rgb(BORDER))
                    .child(
                        div()
                            .flex_shrink_0()
                            .border_b_1()
                            .border_color(rgb(BORDER))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap_3()
                                    .px_5()
                                    .py_4()
                                    .child(
                                        div()
                                            .size(logical(48.))
                                            .rounded_2xl()
                                            .border_1()
                                            .border_color(rgb(BORDER))
                                            .bg(rgb(BG))
                                            .flex()
                                            .items_center()
                                            .justify_center()
                                            .child(
                                                img(Arc::new(Image::from_bytes(
                                                    ImageFormat::Png,
                                                    include_bytes!("../assets/logo.png").to_vec(),
                                                )))
                                                .size(logical(40.))
                                                .object_fit(ObjectFit::Contain),
                                            ),
                                    )
                                    .child(
                                        div()
                                            .flex()
                                            .flex_col()
                                            .child(
                                                div()
                                                    .text_2xl()
                                                    .font_weight(FontWeight::SEMIBOLD)
                                                    .child("TuxScale"),
                                            )
                                            .child(caption(if image {
                                                "AI Image Upscaler"
                                            } else {
                                                "AI Video Upscaler"
                                            })),
                                    ),
                            )
                            .child(
                                div()
                                    .flex()
                                    .justify_center()
                                    .pb_4()
                                    .child(tab(
                                        "Upscale",
                                        !settings,
                                        cx.listener(|this, _, _, cx| {
                                            this.page = Page::Upscale;
                                            this.ui.menu = None;
                                            cx.notify();
                                        }),
                                    ))
                                    .child(tab(
                                        "Settings",
                                        settings,
                                        cx.listener(|this, _, _, cx| {
                                            this.page = Page::Settings;
                                            this.ui.menu = None;
                                            this.refresh_status(cx);
                                            cx.notify();
                                        }),
                                    )),
                            ),
                    )
                    .child(
                        div()
                            .id("sidebar-scroll")
                            .flex_1()
                            .min_h_0()
                            .overflow_y_scroll()
                            .p_5()
                            .child(controls),
                    ),
            )
            .child(
                div()
                    .id("workspace")
                    .relative()
                    .flex_1()
                    .min_w_0()
                    .h_full()
                    .flex()
                    .flex_col()
                    .items_center()
                    .justify_center()
                    .overflow_hidden()
                    .on_click(cx.listener(|this, e, w, cx| {
                        if let ClickEvent::Mouse(mouse) = e {
                            if mouse.up.click_count == 2 && !this.running {
                                this.pick_input(w, cx);
                            }
                        }
                    }))
                    .on_drop(cx.listener(|this, paths: &ExternalPaths, _, cx| {
                        if this.running {
                            return;
                        }
                        if let Some(p) = paths.paths().first() {
                            if p.is_file() {
                                let ext = p
                                    .extension()
                                    .unwrap_or_default()
                                    .to_string_lossy()
                                    .to_lowercase();
                                this.set_mode(
                                    if ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif"]
                                        .contains(&ext.as_str())
                                    {
                                        Mode::Image
                                    } else {
                                        Mode::Video
                                    },
                                    cx,
                                );
                            }
                            this.batch = p.is_dir();
                            this.input = Some(p.clone());
                            this.completed_output = None;
                            this.persist();
                            cx.notify();
                        }
                    }))
                    .child(
                        div()
                            .absolute()
                            .top_6()
                            .flex()
                            .p_1()
                            .rounded_lg()
                            .border_1()
                            .border_color(rgb(BORDER))
                            .bg(rgb(CARD))
                            .child(tab(
                                "Videos",
                                !image,
                                cx.listener(|this, _, _, cx| this.set_mode(Mode::Video, cx)),
                            ))
                            .child(tab(
                                "Images",
                                image,
                                cx.listener(|this, _, _, cx| this.set_mode(Mode::Image, cx)),
                            )),
                    )
                    .child(if self.input.is_none() && !self.running {
                        div()
                            .max_w(logical(384.))
                            .px_5()
                            .flex()
                            .flex_col()
                            .items_center()
                            .text_center()
                            .child(
                                div()
                                    .size(logical(80.))
                                    .mb_6()
                                    .rounded_2xl()
                                    .border_1()
                                    .border_color(rgb(BORDER))
                                    .bg(rgb(CARD))
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .child(icon(
                                        if self.batch {
                                            "folder-open"
                                        } else if image {
                                            "image"
                                        } else {
                                            "video"
                                        },
                                        40.,
                                    )),
                            )
                            .child(div().text_2xl().font_weight(FontWeight::BOLD).mb_2().child(
                                if self.batch {
                                    if image {
                                        "Batch Image Upscale"
                                    } else {
                                        "Batch Upscale"
                                    }
                                } else if image {
                                    "Image Upscale"
                                } else {
                                    "Video Upscale"
                                },
                            ))
                            .child(caption(if self.batch {
                                "Select a folder containing media to upscale them all at once."
                            } else if image {
                                "Select an image or drag and drop it here to start upscaling."
                            } else {
                                "Select a video or drag and drop it here to start upscaling."
                            }))
                            .child(
                                div()
                                    .mt_6()
                                    .p_4()
                                    .w_full()
                                    .rounded_2xl()
                                    .bg(rgb(CARD))
                                    .border_1()
                                    .border_color(rgb(BORDER))
                                    .flex()
                                    .flex_col()
                                    .gap_3()
                                    .children(
                                        [
                                            (
                                                "1",
                                                if self.batch {
                                                    "Select a folder"
                                                } else if image {
                                                    "Select an image"
                                                } else {
                                                    "Select a video"
                                                },
                                                "Click the button or double-click this area.",
                                            ),
                                            (
                                                "2",
                                                "Configure the AI model",
                                                "Choose a model, scale, and any extra options.",
                                            ),
                                            (
                                                "3",
                                                "Upscale",
                                                "Hit the Upscale button and wait for the magic.",
                                            ),
                                        ]
                                        .into_iter()
                                        .map(
                                            |(n, t, s)| {
                                                div()
                                                    .flex()
                                                    .gap_3()
                                                    .text_left()
                                                    .child(
                                                        div()
                                                            .size(logical(24.))
                                                            .flex_shrink_0()
                                                            .rounded_full()
                                                            .bg(rgb(SECONDARY))
                                                            .flex()
                                                            .items_center()
                                                            .justify_center()
                                                            .text_xs()
                                                            .child(n),
                                                    )
                                                    .child(
                                                        div()
                                                            .flex()
                                                            .flex_col()
                                                            .child(t)
                                                            .child(caption(s)),
                                                    )
                                            },
                                        ),
                                    ),
                            )
                            .child(div().mt_6().child(caption(
                                "Double-click to select   ·   Drag & drop supported",
                            )))
                            .into_any_element()
                    } else {
                        let output = self.completed_output.clone();
                        let input = self.input.clone();
                        div()
                            .w_full()
                            .h_full()
                            .pt(logical(88.))
                            .px_8()
                            .pb_8()
                            .flex()
                            .flex_col()
                            .gap_4()
                            .child(caption(
                                self.input
                                    .as_ref()
                                    .map(|p| p.display().to_string())
                                    .unwrap_or_default(),
                            ))
                            .child(if image && !self.batch {
                                self.image_preview(cx)
                            } else {
                                div()
                                    .flex_1()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .child(button(
                                        "Open source preview",
                                        false,
                                        input.is_none(),
                                        cx.listener(move |_, _, _, cx| {
                                            if let Some(p) = &input {
                                                cx.open_with_system(p);
                                            }
                                        }),
                                    ))
                                    .into_any_element()
                            })
                            .child(caption(self.stage.clone()))
                            .child(
                                div()
                                    .h(logical(6.))
                                    .w_full()
                                    .rounded_full()
                                    .bg(rgb(SECONDARY))
                                    .child(
                                        div()
                                            .h_full()
                                            .w(relative(self.progress.clamp(0., 1.)))
                                            .bg(rgb(PRIMARY)),
                                    ),
                            )
                            .child(button(
                                if self.ui.show_logs {
                                    "Hide logs (Ctrl+L)"
                                } else {
                                    "Show logs (Ctrl+L)"
                                },
                                false,
                                false,
                                cx.listener(|this, _, _, cx| {
                                    this.ui.show_logs = !this.ui.show_logs;
                                    cx.notify();
                                }),
                            ))
                            .when(self.ui.show_logs, |d| {
                                d.child(
                                    div()
                                        .id("process-logs")
                                        .h(logical(160.))
                                        .overflow_y_scroll()
                                        .bg(rgb(CARD))
                                        .p_3()
                                        .children(
                                            self.logs
                                                .iter()
                                                .rev()
                                                .take(100)
                                                .map(|l| caption(l.clone())),
                                        ),
                                )
                            })
                            .when(output.is_some(), |d| {
                                d.child(button(
                                    "Open completed result",
                                    false,
                                    false,
                                    cx.listener(move |_, _, _, cx| {
                                        if let Some(p) = &output {
                                            cx.open_with_system(p);
                                        }
                                    }),
                                ))
                            })
                            .into_any_element()
                    }),
            )
    }
}
