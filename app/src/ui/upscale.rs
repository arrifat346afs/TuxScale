//! Sidebar upscale panel composed from shared controls.
use super::*;

impl TuxScale {
    pub(super) fn upscale_controls(&self, cx: &Context<Self>) -> AnyElement {
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
            .w_full()
            .min_w_0()
            .flex_shrink_0()
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
}
