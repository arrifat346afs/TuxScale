use gpui::{AssetSource, Result, SharedString};
use std::borrow::Cow;
pub struct Assets;
impl AssetSource for Assets {
    fn load(&self, path: &str) -> Result<Option<Cow<'static, [u8]>>> {
        Ok(match path {
            "video" => Some(Cow::Borrowed(
                include_bytes!("../assets/icons/video.svg") as &[u8]
            )),
            "image" => Some(Cow::Borrowed(
                include_bytes!("../assets/icons/image.svg") as &[u8]
            )),
            "film" => Some(Cow::Borrowed(
                include_bytes!("../assets/icons/film.svg") as &[u8]
            )),
            "folder" => Some(Cow::Borrowed(
                include_bytes!("../assets/icons/folder.svg") as &[u8]
            )),
            "folder-open" => Some(Cow::Borrowed(
                include_bytes!("../assets/icons/folder-open.svg") as &[u8],
            )),
            "file-video" => Some(Cow::Borrowed(
                include_bytes!("../assets/icons/file-video.svg") as &[u8],
            )),
            "file-image" => Some(Cow::Borrowed(
                include_bytes!("../assets/icons/file-image.svg") as &[u8],
            )),
            "rocket" => Some(Cow::Borrowed(
                include_bytes!("../assets/icons/rocket.svg") as &[u8]
            )),
            "layers" => Some(Cow::Borrowed(
                include_bytes!("../assets/icons/layers.svg") as &[u8]
            )),
            "chevron-down" => Some(Cow::Borrowed(
                include_bytes!("../assets/icons/chevron-down.svg") as &[u8],
            )),
            "check" => Some(Cow::Borrowed(
                include_bytes!("../assets/icons/check.svg") as &[u8]
            )),
            _ => None,
        })
    }
    fn list(&self, _: &str) -> Result<Vec<SharedString>> {
        Ok(vec![])
    }
}
