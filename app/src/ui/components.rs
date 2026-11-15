//! Shared stateless GPUI controls. Callers supply state and event callbacks.
use super::*;

// Use the same rem basis for fixed dimensions and spacing, so interface zoom
// changes menus, icons, sliders, and text together without changing display DPI.
pub(super) fn logical(value: f32) -> Rems {
    rems(value / 16.)
}

pub(super) fn icon(name: &'static str, size: f32) -> impl IntoElement {
    svg()
        .path(name)
        .size(logical(size))
        .text_color(rgb(MUTED))
        .flex_shrink_0()
}
pub(super) fn caption(text: impl Into<SharedString>) -> Div {
    div()
        .flex()
        .flex_col()
        .flex_shrink_0()
        .min_w_0()
        .overflow_hidden()
        .text_xs()
        .text_color(rgb(MUTED))
        .child(text.into())
}
pub(super) fn panel() -> Div {
    div()
        .w_full()
        .min_w_0()
        .flex_shrink_0()
        .flex()
        .flex_col()
        .gap_3()
        .p_5()
        .rounded_md()
        .border_1()
        .border_color(rgb(BORDER))
        .bg(rgb(POPOVER))
}
pub(super) fn button(
    label: &'static str,
    primary: bool,
    disabled: bool,
    click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    div()
        .id(label)
        .w_full()
        .h(logical(36.))
        .min_w_0()
        .flex_shrink_0()
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
pub(super) fn tab(
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
pub(super) fn toggle(
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
pub(super) fn options(values: &[(&str, &str)]) -> Vec<(String, String)> {
    values
        .iter()
        .map(|(v, l)| (v.to_string(), l.to_string()))
        .collect()
}
