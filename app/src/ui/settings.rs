//! Sidebar settings panel composed from shared controls.
use super::*;

impl TuxScale {
    pub(super) fn settings_controls(&self, cx: &Context<Self>) -> AnyElement {
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
            .w_full()
            .min_w_0()
            .flex_shrink_0()
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
                    .when(!engine::is_packaged(), |panel| {
                        panel.child(button(
                            "Install PyTorch CUDA environment",
                            false,
                            self.running,
                            cx.listener(|this, _, w, cx| this.start_installer(w, cx)),
                        ))
                    }),
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
                                .child(div().flex_1().min_w_0().child(button(
                                    "−",
                                    false,
                                    self.running,
                                    cx.listener(|this, _, _, cx| {
                                        this.batch_size = this.batch_size.saturating_sub(1).max(1);
                                        this.persist();
                                        cx.notify();
                                    }),
                                )))
                                .child(div().flex_1().min_w_0().child(button(
                                    "+",
                                    false,
                                    self.running,
                                    cx.listener(|this, _, _, cx| {
                                        this.batch_size = (this.batch_size + 1).min(100);
                                        this.persist();
                                        cx.notify();
                                    }),
                                ))),
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
