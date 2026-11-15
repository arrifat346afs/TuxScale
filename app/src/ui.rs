mod components;
mod empty_state;
mod inputs;
mod settings;
mod theme;
mod upscale;

use super::*;
use components::*;
use gpui::{div, img, prelude::*, *};
use std::{cell::Cell, rc::Rc};
use theme::*;

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
    pub(super) preview_open: bool,
    pub(super) layout: crate::layout::Layout,
    pub(super) preview: crate::preview::PreviewState,
    pub(super) video: crate::video_preview::VideoPreviewState,
    focus: Option<FocusHandle>,
    menu: Option<Menu>,
    show_logs: bool,
    status: String,
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
}

impl Render for TuxScale {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        window.set_rem_size(px(16. * self.interface_scale as f32 / 100.));
        if self.ui.focus.is_none() {
            let f = cx.focus_handle();
            window.focus(&f);
            self.ui.focus = Some(f);
        }
        let viewport = window.viewport_size();
        let layout = crate::layout::Layout::new(
            f32::from(viewport.width),
            f32::from(viewport.height),
            self.interface_scale,
        );
        self.ui.layout = layout;
        self.sync_video_preview(window, cx);
        let compact = layout.compact;
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
            .overflow_hidden()
            .flex()
            .when(compact, |d| d.flex_col())
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
            .when(compact, |d| {
                d.child(
                    div()
                        .w_full()
                        .flex()
                        .flex_shrink_0()
                        .gap_2()
                        .px_3()
                        .py_2()
                        .bg(rgb(CARD))
                        .child(tab(
                            "Controls",
                            !self.ui.preview_open,
                            cx.listener(|this, _, _, cx| {
                                this.ui.preview_open = false;
                                this.ui.menu = None;
                                cx.notify();
                            }),
                        ))
                        .child(tab(
                            "Preview",
                            self.ui.preview_open,
                            cx.listener(|this, _, _, cx| {
                                this.ui.preview_open = true;
                                this.ui.menu = None;
                                cx.notify();
                            }),
                        )),
                )
            })
            .child(
                div()
                    .w(px(layout.sidebar_width))
                    .flex_shrink_0()
                    .h_full()
                    .flex()
                    .flex_col()
                    .bg(rgb(CARD))
                    .when(compact, |d| d.w_full().h_auto().flex_1().min_h_0())
                    .when(compact && self.ui.preview_open, |d| d.hidden())
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
                    .when(compact, |d| {
                        d.child(
                            div()
                                .flex()
                                .justify_center()
                                .flex_shrink_0()
                                .py_2()
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
                    })
                    .child(
                        div()
                            .id("sidebar-scroll")
                            .w_full()
                            .flex()
                            .flex_col()
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
                    .when(compact, |d| d.h_auto().min_h_0().w_full())
                    .overflow_hidden()
                    .when(compact && !self.ui.preview_open, |d| d.hidden())
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
                            this.ui.preview_open = true;
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
                        self.empty_state(viewport)
                    } else {
                        let output = self.completed_output.clone();
                        let input = self.input.clone();
                        div()
                            .id("workspace-scroll")
                            .w_full()
                            .h_full()
                            .min_h_0()
                            .overflow_y_scroll()
                            .pt(logical(88.))
                            .px(px(layout.padding))
                            .pb(px(layout.padding))
                            .flex()
                            .flex_col()
                            .gap_4()
                            .when(layout.short, |d| d.gap_2())
                            .child(
                                caption(
                                    self.input
                                        .as_ref()
                                        .map(|p| p.display().to_string())
                                        .unwrap_or_default(),
                                )
                                .w_full()
                                .text_ellipsis()
                                .flex_shrink_0(),
                            )
                            .child(if image && !self.batch {
                                self.image_preview(cx)
                            } else if !image && !self.batch {
                                self.video_preview(cx)
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
                            .child(caption(self.stage.clone()).flex_shrink_0())
                            .child(
                                div()
                                    .h(logical(6.))
                                    .flex_shrink_0()
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
                                        .h(px(layout.log_height))
                                        .flex_shrink_0()
                                        .min_w_0()
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

#[cfg(test)]
mod layout_fixture {
    use super::*;

    // Interactive fixture for checking the empty state and settings at each zoom.
    // Uses an isolated XDG_CONFIG_HOME when launched for visual checks.
    #[::core::prelude::v1::test]
    #[ignore = "opens a native window; requires a display"]
    fn native_layout_fixture() {
        Application::new()
            .with_assets(crate::assets::Assets)
            .run(|cx| {
                cx.open_window(WindowOptions::default(), |window, cx| {
                    window.set_window_title("TuxScale Layout Fixture");
                    cx.new(|_| {
                        let mut app = TuxScale::default();
                        app.page = Page::Settings;
                        app.interface_scale = std::env::var("TUXSCALE_LAYOUT_SCALE")
                            .ok()
                            .and_then(|s| s.parse().ok())
                            .unwrap_or(100);
                        app
                    })
                })
                .unwrap();
                cx.activate(true);
            });
    }
}
