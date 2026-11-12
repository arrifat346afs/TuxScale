//! Geometry shared by the sidebar, compact navigation, and popup menus.
#[derive(Clone, Copy)]
pub struct Layout {
    pub compact: bool,
    pub sidebar_width: f32,
    pub popup_width: f32,
    pub popup_height: f32,
    pub padding: f32,
    pub log_height: f32,
    pub short: bool,
}
impl Layout {
    pub fn new(width: f32, height: f32, percent: u16) -> Self {
        let scale = percent as f32 / 100.;
        let compact = width < 760. * scale;
        let short = height < 650. * scale;
        let sidebar_width = if compact {
            width
        } else {
            (width * 0.36).clamp(280. * scale, 352. * scale)
        };
        Self {
            compact,
            short,
            sidebar_width,
            popup_width: (sidebar_width - 80. * scale)
                .max(80.)
                .min((width - 16.).max(80.)),
            popup_height: (280. * scale).min((height - 32.).max(80.)),
            padding: if compact || short {
                12. * scale
            } else {
                32. * scale
            },
            log_height: (160. * scale).min(height * 0.2),
        }
    }
}
impl Default for Layout {
    fn default() -> Self {
        Self::new(900., 670., 80)
    }
}
#[cfg(test)]
mod tests {
    use super::Layout;
    #[test]
    fn layouts_fit_small_windows_and_large_interface_scales() {
        for scale in [60, 80, 100, 125] {
            for (w, h) in [(480., 360.), (600., 480.), (900., 670.), (1280., 800.)] {
                let l = Layout::new(w, h, scale);
                assert!(l.popup_width <= w - 16.);
                assert!(l.popup_height <= h - 32.);
                if l.compact {
                    assert_eq!(l.sidebar_width, w);
                } else {
                    assert!(w - l.sidebar_width >= 360. * scale as f32 / 100.);
                }
            }
        }
    }
}
