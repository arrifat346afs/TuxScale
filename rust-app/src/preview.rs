//! Full-canvas image preview and a reveal comparison. Both images always receive
//! identical layout bounds; only the paint mask moves, so dragging never resizes them.
use crate::TuxScale;
use gpui::{prelude::*, *};
use std::{cell::Cell, path::PathBuf, rc::Rc};

pub struct PreviewState {
    pair: Option<(PathBuf, Option<PathBuf>)>,
    pub fraction: f32,
    pub dragging: bool,
    bounds: Rc<Cell<Bounds<Pixels>>>,
    focus: Option<FocusHandle>,
}
impl Default for PreviewState {
    fn default() -> Self {
        Self {
            pair: None,
            fraction: 0.5,
            dragging: false,
            bounds: Rc::new(Cell::new(Bounds::default())),
            focus: None,
        }
    }
}
impl PreviewState {
    pub fn move_to(&mut self, position: Point<Pixels>) {
        let bounds = self.bounds.get();
        if bounds.size.width > px(0.) {
            self.fraction = ((position.x - bounds.origin.x) / bounds.size.width).clamp(0., 1.);
        }
    }
}

struct Reveal {
    image: AnyElement,
    fraction: f32,
}
impl IntoElement for Reveal {
    type Element = Self;
    fn into_element(self) -> Self {
        self
    }
}
impl Element for Reveal {
    type RequestLayoutState = ();
    type PrepaintState = ();
    fn id(&self) -> Option<ElementId> {
        None
    }
    fn source_location(&self) -> Option<&'static core::panic::Location<'static>> {
        None
    }
    fn request_layout(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, ()) {
        (self.image.request_layout(window, cx), ())
    }
    fn prepaint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        _: Bounds<Pixels>,
        _: &mut (),
        window: &mut Window,
        cx: &mut App,
    ) {
        self.image.prepaint(window, cx);
    }
    fn paint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        _: &mut (),
        _: &mut (),
        window: &mut Window,
        cx: &mut App,
    ) {
        let mask = ContentMask {
            bounds: Bounds::new(
                bounds.origin,
                size(bounds.size.width * self.fraction, bounds.size.height),
            ),
        };
        window.with_content_mask(Some(mask), |window| self.image.paint(window, cx));
    }
}

impl TuxScale {
    pub(crate) fn image_preview(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let Some(input) = self.input.clone() else {
            return div().flex_1().into_any_element();
        };
        let output = self.completed_output.clone();
        let pair = (input.clone(), output.clone());
        if self.ui.preview.pair.as_ref() != Some(&pair) {
            self.ui.preview.pair = Some(pair);
            self.ui.preview.fraction = 0.5;
            self.ui.preview.dragging = false;
        }
        let mut preview = div()
            .id("image-preview")
            .relative()
            .flex_1()
            .min_h(rems(10.))
            .w_full()
            .overflow_hidden();
        if let Some(output) = output {
            let focus = self
                .ui
                .preview
                .focus
                .get_or_insert_with(|| cx.focus_handle())
                .clone();
            let fraction = self.ui.preview.fraction;
            let bounds = self.ui.preview.bounds.clone();
            preview = preview
                .track_focus(&focus)
                .tab_index(0)
                .cursor(CursorStyle::ResizeLeftRight)
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(move |this, event: &MouseDownEvent, window, cx| {
                        window.focus(&focus);
                        this.ui.preview.dragging = true;
                        this.ui.preview.move_to(event.position);
                        cx.stop_propagation();
                        cx.notify();
                    }),
                )
                .on_click(|_, _, cx| cx.stop_propagation())
                .on_key_down(cx.listener(|this, event: &KeyDownEvent, _, cx| {
                    match event.keystroke.key.as_str() {
                        "left" => {
                            this.ui.preview.fraction = (this.ui.preview.fraction - 0.02).max(0.)
                        }
                        "right" => {
                            this.ui.preview.fraction = (this.ui.preview.fraction + 0.02).min(1.)
                        }
                        "home" => this.ui.preview.fraction = 0.,
                        "end" => this.ui.preview.fraction = 1.,
                        _ => return,
                    }
                    cx.stop_propagation();
                    cx.notify();
                }))
                // The output and input both occupy the entire viewport, including
                // identical aspect-fit letterboxing. The input is clipped at the divider.
                .child(
                    img(output)
                        .absolute()
                        .size_full()
                        .object_fit(ObjectFit::Contain),
                )
                .child(Reveal {
                    // Give the before image a real, inset-stretched containing block.
                    // Resolving its intrinsic source dimensions independently made
                    // portrait images render at their natural width beside the output.
                    image: div()
                        .relative()
                        .size_full()
                        .bg(rgb(0x0f1419))
                        .child(
                            img(input)
                                .absolute()
                                .size_full()
                                .object_fit(ObjectFit::Contain),
                        )
                        .into_any_element(),
                    fraction,
                })
                .child(
                    canvas(move |area, _, _| bounds.set(area), |_, _, _, _| {})
                        .absolute()
                        .size_full(),
                )
                .child(
                    div()
                        .absolute()
                        .left_3()
                        .top_3()
                        .px_3()
                        .py_1()
                        .rounded_md()
                        .bg(rgba(0x101419dd))
                        .text_xs()
                        .child("Before"),
                )
                .child(
                    div()
                        .absolute()
                        .right_3()
                        .top_3()
                        .px_3()
                        .py_1()
                        .rounded_md()
                        .bg(rgba(0x101419dd))
                        .text_xs()
                        .child("After"),
                )
                .child(
                    div()
                        .absolute()
                        .left(relative(fraction))
                        .top_0()
                        .bottom_0()
                        .ml(px(-1.))
                        .w(px(2.))
                        .bg(rgb(0xe5e9ee))
                        .child(
                            div()
                                .absolute()
                                .top(relative(0.5))
                                .left(px(-15.))
                                .mt(px(-16.))
                                .size(px(32.))
                                .rounded_full()
                                .border_1()
                                .border_color(rgb(0xe5e9ee))
                                .bg(rgb(0x161c24))
                                .flex()
                                .items_center()
                                .justify_center()
                                .text_sm()
                                .child("↔"),
                        ),
                );
        } else {
            preview = preview.child(
                img(input)
                    .absolute()
                    .size_full()
                    .object_fit(ObjectFit::Contain),
            );
        }
        preview.into_any_element()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[::core::prelude::v1::test]
    fn divider_uses_viewport_coordinates_and_clamps_at_edges() {
        let mut state = PreviewState::default();
        state.bounds.set(Bounds::new(
            point(px(300.), px(50.)),
            size(px(800.), px(600.)),
        ));
        for (x, expected) in [
            (700., 0.5),
            (300., 0.),
            (1100., 1.),
            (-10., 0.),
            (2000., 1.),
        ] {
            state.move_to(point(px(x), px(200.)));
            assert_eq!(state.fraction, expected);
        }
        state.bounds.set(Bounds::default());
        state.move_to(point(px(50.), px(0.)));
        assert!(state.fraction.is_finite());
    }
    // A native rendering harness, used with externally supplied fixture paths.
    // Ignored during normal tests because it opens an interactive window.
    #[::core::prelude::v1::test]
    #[ignore = "requires a display and TUXSCALE_PREVIEW_TEST_INPUT fixture"]
    fn native_preview_fixture() {
        let input = std::env::var_os("TUXSCALE_PREVIEW_TEST_INPUT").expect("input fixture");
        let output = std::env::var_os("TUXSCALE_PREVIEW_TEST_OUTPUT");
        Application::new()
            .with_assets(crate::assets::Assets)
            .run(move |cx| {
                cx.open_window(WindowOptions::default(), |window, cx| {
                    window.set_window_title("TuxScale Preview Test");
                    cx.new(|_| {
                        let mut app = TuxScale::default();
                        app.mode = crate::Mode::Image;
                        app.batch = false;
                        app.input = Some(PathBuf::from(input));
                        app.ui.preview_open = true;
                        app.completed_output = output.map(PathBuf::from);
                        app
                    })
                })
                .unwrap();
                cx.activate(true);
            });
    }
}
