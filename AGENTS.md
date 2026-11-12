# TuxScale Project Instructions

TuxScale is a native Rust + GPUI application in `app/`.

## Development

- Run: `cargo run --manifest-path app/Cargo.toml`
- Check: `cargo check --locked --manifest-path app/Cargo.toml`
- Test: `cargo test --locked --manifest-path app/Cargo.toml`
- Format: `cargo fmt --manifest-path app/Cargo.toml`
- Package Linux: `bash app/scripts/package-linux.sh`
- Keep `app/Cargo.lock` committed for reproducible application builds.
- Do not reintroduce Electron, Node, Bun, or a JavaScript frontend/build pipeline.

## Runtime resources

- Keep `resources/models`, `resources/linux/bin`, and `resources/python`: the native app uses these for inference.
- The PyTorch backend runs the existing Python workers. Reuse an installed environment before installing another one.
- Do not commit Python environments, Cargo targets, package outputs, or local caches.
- Preserve licenses for bundled assets and vendored Rust dependencies.
