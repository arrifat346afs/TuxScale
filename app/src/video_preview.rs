//! Embedded, muted video playback. Decode off the UI thread and keep only the
//! current frame in GPU memory; switching sources cancels the previous decoder.
use crate::{
    Mode, TuxScale,
    video_decode::{self, Event, Session},
};
use gpui::{prelude::*, *};
use std::{cell::Cell, path::PathBuf, rc::Rc, sync::Arc};

#[derive(Default)]
pub(crate) struct VideoPreviewState {
    input: Option<PathBuf>,
    source: Option<PathBuf>,
    show_output: bool,
    session: Option<Session>,
    generation: u64,
    frame: Option<Arc<RenderImage>>,
    duration: f64,
    dimensions: (u32, u32),
    position: f64,
    playing: bool,
    message: String,
}

impl TuxScale {
    pub(crate) fn sync_video_preview(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let input = if self.mode == Mode::Video && !self.batch {
            self.input.clone()
        } else {
            None
        };
        if input != self.ui.video.input {
            self.pause_video();
            if let Some(frame) = self.ui.video.frame.take() {
                cx.drop_image(frame, Some(window));
            }
            self.ui.video.input = input.clone();
            self.ui.video.source = input;
            self.ui.video.show_output = false;
            self.ui.video.duration = 0.;
            self.ui.video.dimensions = (0, 0);
            self.ui.video.position = 0.;
            self.ui.video.message.clear();
            if self.ui.video.source.is_some() {
                self.decode_video(0., false, cx);
            }
        }
        if self.ui.video.show_output && self.completed_output != self.ui.video.source {
            self.ui.video.show_output = false;
            self.ui.video.source = self.ui.video.input.clone();
            self.decode_video(0., false, cx);
        }
        // Free decoder resources when processing starts or the compact controls
        // page hides the preview. The currently displayed frame remains visible.
        if self.ui.video.playing
            && (self.running || (self.ui.layout.compact && !self.ui.preview_open))
        {
            self.pause_video();
        }
    }

    fn pause_video(&mut self) {
        self.ui.video.generation += 1;
        self.ui.video.session = None;
        self.ui.video.playing = false;
    }

    fn decode_video(&mut self, position: f64, playing: bool, cx: &mut Context<Self>) {
        let Some(path) = self.ui.video.source.clone() else {
            return;
        };
        self.pause_video();
        let generation = self.ui.video.generation;
        let position = if self.ui.video.duration > 0. {
            position.clamp(0., (self.ui.video.duration - 0.05).max(0.))
        } else {
            0.
        };
        self.ui.video.position = position;
        self.ui.video.playing = playing;
        self.ui.video.message = "Loading video…".into();
        let (events, session) = video_decode::start(path, position, playing);
        self.ui.video.session = Some(session);
        cx.spawn(async move |this, cx| {
            while let Ok(event) = events.recv().await {
                let keep_going = this
                    .update(cx, |this, cx| {
                        if this.ui.video.generation != generation {
                            return false;
                        }
                        match event {
                            Event::Ready(meta) => {
                                this.ui.video.duration = meta.duration;
                                this.ui.video.dimensions = (meta.width, meta.height);
                            }
                            Event::Frame { pixels, position } => {
                                if let Some(buffer) = image::RgbaImage::from_raw(
                                    video_decode::WIDTH,
                                    video_decode::HEIGHT,
                                    pixels,
                                ) {
                                    let frame =
                                        Arc::new(RenderImage::new(vec![image::Frame::new(buffer)]));
                                    if let Some(old) = this.ui.video.frame.replace(frame) {
                                        cx.drop_image(old, None);
                                    }
                                    this.ui.video.position = position;
                                    this.ui.video.message.clear();
                                }
                            }
                            Event::Ended => {
                                this.ui.video.playing = false;
                                this.ui.video.session = None;
                            }
                            Event::Error(error) => {
                                this.ui.video.playing = false;
                                this.ui.video.session = None;
                                this.ui.video.message = error;
                            }
                        }
                        cx.notify();
                        true
                    })
                    .unwrap_or(false);
                if !keep_going {
                    break;
                }
            }
        })
        .detach();
        cx.notify();
    }

    fn toggle_video(&mut self, cx: &mut Context<Self>) {
        if self.ui.video.playing {
            self.pause_video();
            cx.notify();
        } else if !self.running {
            let position = if self.ui.video.position >= self.ui.video.duration - 0.1 {
                0.
            } else {
                self.ui.video.position
            };
            self.decode_video(position, true, cx);
        }
    }

    pub(crate) fn video_preview(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let frame = self.ui.video.frame.clone();
        let duration = self.ui.video.duration;
        let fraction = if duration > 0. {
            (self.ui.video.position / duration).clamp(0., 1.) as f32
        } else {
            0.
        };
        let bounds = Rc::new(Cell::new(Bounds::<Pixels>::default()));
        let paint_bounds = bounds.clone();
        let can_show_output = self.completed_output.as_ref().is_some_and(|p| {
            matches!(
                p.extension().and_then(|s| s.to_str()),
                Some("mp4" | "mkv" | "mov" | "avi" | "webm")
            )
        });
        div()
            .id("video-preview")
            .w_full()
            .flex_1()
            .min_h(rems(15.))
            .flex()
            .flex_col()
            .gap_2()
            .child(
                div()
                    .relative()
                    .w_full()
                    .flex_1()
                    .min_h(rems(10.))
                    .overflow_hidden()
                    .bg(rgb(0x000000))
                    .when_some(frame, |d, frame| {
                        d.child(
                            img(frame)
                                .absolute()
                                .size_full()
                                .object_fit(ObjectFit::Contain),
                        )
                    })
                    .when(!self.ui.video.message.is_empty(), |d| {
                        d.child(
                            div()
                                .absolute()
                                .inset_0()
                                .flex()
                                .items_center()
                                .justify_center()
                                .p_4()
                                .child(
                                    div()
                                        .max_w_full()
                                        .p_3()
                                        .rounded_md()
                                        .bg(rgba(0x161c24ee))
                                        .child(self.ui.video.message.clone()),
                                ),
                        )
                    }),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .flex_wrap()
                    .flex_shrink_0()
                    .child(control(
                        "video-play",
                        if self.ui.video.playing {
                            "Pause"
                        } else {
                            "Play"
                        },
                        cx.listener(|this, _, _, cx| this.toggle_video(cx)),
                    ))
                    .child(control(
                        "video-back",
                        "−5s",
                        cx.listener(|this, _, _, cx| {
                            this.decode_video(
                                this.ui.video.position - 5.,
                                this.ui.video.playing,
                                cx,
                            );
                        }),
                    ))
                    .child(control(
                        "video-forward",
                        "+5s",
                        cx.listener(|this, _, _, cx| {
                            this.decode_video(
                                this.ui.video.position + 5.,
                                this.ui.video.playing,
                                cx,
                            );
                        }),
                    ))
                    .child(div().text_xs().child(format!(
                        "{} / {}",
                        timestamp(self.ui.video.position),
                        timestamp(duration)
                    )))
                    .child(
                        div()
                            .text_xs()
                            .text_color(rgb(0x8590a0))
                            .child("Muted preview"),
                    )
                    .when(self.ui.video.dimensions.0 > 0, |d| {
                        d.child(div().text_xs().text_color(rgb(0x8590a0)).child(format!(
                            "{} × {}",
                            self.ui.video.dimensions.0, self.ui.video.dimensions.1
                        )))
                    })
                    .when(can_show_output, |d| {
                        d.child(control(
                            "video-source",
                            if self.ui.video.show_output {
                                "Show source"
                            } else {
                                "Show result"
                            },
                            cx.listener(|this, _, _, cx| {
                                this.ui.video.show_output = !this.ui.video.show_output;
                                this.ui.video.source = if this.ui.video.show_output {
                                    this.completed_output.clone()
                                } else {
                                    this.input.clone()
                                };
                                this.decode_video(0., false, cx);
                            }),
                        ))
                    })
                    .child(control(
                        "video-retry",
                        "Reload",
                        cx.listener(|this, _, _, cx| this.decode_video(0., false, cx)),
                    )),
            )
            .child(
                div()
                    .id("video-timeline")
                    .relative()
                    .w_full()
                    .h(rems(1.))
                    .flex_shrink_0()
                    .cursor_pointer()
                    .on_mouse_down(
                        MouseButton::Left,
                        cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                            let area = bounds.get();
                            if area.size.width > px(0.) && duration > 0. {
                                let fraction = ((event.position.x - area.origin.x)
                                    / area.size.width)
                                    .clamp(0., 1.);
                                this.decode_video(
                                    f64::from(fraction) * duration,
                                    this.ui.video.playing,
                                    cx,
                                );
                            }
                            cx.stop_propagation();
                        }),
                    )
                    .child(
                        div()
                            .absolute()
                            .top(rems(0.375))
                            .w_full()
                            .h(rems(0.25))
                            .bg(rgb(0x28313d))
                            .child(div().h_full().w(relative(fraction)).bg(rgb(0x7ab0d0))),
                    )
                    .child(
                        canvas(move |area, _, _| paint_bounds.set(area), |_, _, _, _| {})
                            .absolute()
                            .size_full(),
                    ),
            )
            .into_any_element()
    }
}

fn control(
    id: &'static str,
    label: &'static str,
    click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    div()
        .id(id)
        .px_3()
        .py_1()
        .rounded_md()
        .bg(rgb(0x1e2630))
        .text_sm()
        .cursor_pointer()
        .hover(|s| s.bg(rgb(0x28313d)))
        .on_click(move |e, w, cx| {
            cx.stop_propagation();
            click(e, w, cx);
        })
        .child(label)
}
fn timestamp(seconds: f64) -> String {
    let seconds = seconds.max(0.) as u64;
    format!("{}:{:02}", seconds / 60, seconds % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[::core::prelude::v1::test]
    #[ignore = "requires a display and TUXSCALE_VIDEO_TEST_INPUT fixture"]
    fn native_video_preview_fixture() {
        let input = std::env::var_os("TUXSCALE_VIDEO_TEST_INPUT").expect("video fixture");
        Application::new()
            .with_assets(crate::assets::Assets)
            .run(move |cx| {
                cx.open_window(WindowOptions::default(), |window, cx| {
                    window.set_window_title("TuxScale Video Preview Test");
                    cx.new(|_| {
                        let mut app = TuxScale::default();
                        app.mode = Mode::Video;
                        app.batch = false;
                        app.input = Some(PathBuf::from(input));
                        app.ui.preview_open = true;
                        app
                    })
                })
                .unwrap();
                cx.activate(true);
            });
    }
}
