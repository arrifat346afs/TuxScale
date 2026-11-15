//! Import instructions shared by image, video, and folder modes.
use super::*;

impl TuxScale {
    pub(super) fn empty_state(&self, viewport: Size<Pixels>) -> AnyElement {
        let image = self.mode == Mode::Image;
        div()
            .id("idle-scroll")
            .w_full()
            .h_full()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .items_center()
            .pt(px(((f32::from(viewport.height)
                - 420. * self.interface_scale as f32 / 100.)
                / 2.)
                .max(88. * self.interface_scale as f32 / 100.)))
            .pb_6()
            .child(
                div()
                    .w_full()
                    .flex()
                    .flex_col()
                    .items_center()
                    .flex_shrink_0()
                    .child(
                        div()
                            .w_full()
                            .max_w(logical(424.))
                            .flex_shrink_0()
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
                                                    .w_full()
                                                    .flex_shrink_0()
                                                    .flex()
                                                    .items_start()
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
                                                            .flex_1()
                                                            .min_w_0()
                                                            .flex()
                                                            .flex_col()
                                                            .child(div().w_full().child(t))
                                                            .child(caption(s).w_full()),
                                                    )
                                            },
                                        ),
                                    ),
                            )
                            .child(div().mt_6().child(caption(
                                "Double-click to select   ·   Drag & drop supported",
                            ))),
                    ),
            )
            .into_any_element()
    }
}
