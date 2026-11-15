//! Dropdown and slider bindings to application state.
use super::*;

impl TuxScale {
    pub(super) fn dropdown(
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
                .min_w_0()
                .flex_shrink_0()
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
                        .min_w_0()
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
                    .w(px(self.ui.layout.popup_width))
                    .max_h(px(self.ui.layout.popup_height))
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
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .overflow_hidden()
                                    .text_ellipsis()
                                    .child(label.clone()),
                            )
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
    pub(super) fn slider(&self, quality: bool, cx: &Context<Self>) -> AnyElement {
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
}
