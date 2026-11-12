This is xattr 0.2.3 (MIT OR Apache-2.0), vendored to patch its Linux errno alias.
GPUI 0.2.2 pulls it through zed-async-tar; recent libc releases expose ENODATA,
not ENOATTR, on Linux. The patch uses ENODATA on Linux and retains ENOATTR on
macOS and BSD.
