<div align="center">
  <img src="resources/icon.png" alt="TuxScale Logo" width="120" />
  <h1>TuxScale</h1>
  <p>Native Rust + GPUI image and video upscaling for Linux</p>
</div>

TuxScale uses GPUI for its desktop interface and Rust for job orchestration. NCNN/Vulkan and the existing Python/PyTorch CUDA workers perform inference. The application does not require Electron, Node.js, or JavaScript dependencies.

## Run

Install a Rust toolchain and your distribution's GPUI build dependencies (C/C++ build tools, pkg-config, fontconfig, Vulkan, and X11/Wayland development libraries). The CI workflow lists the Ubuntu packages used for native builds.

```sh
git lfs install
git clone https://github.com/arrifat346afs/TuxScale.git
cd TuxScale
git lfs pull
cargo run --manifest-path app/Cargo.toml
```

FFmpeg and FFprobe must be on `PATH` for video processing. NCNN needs a working Vulkan driver. PyTorch requires an NVIDIA CUDA environment.

## Features

- Image/video modes, single-file and folder processing.
- Native file selection, drag and drop, and saved preferences.
- Model, scale, output format, quality, tile, and backend controls.
- Adjustable interface scale (80% by default).
- Full-area image preview and an interactive before/after reveal slider.
- Progress, cancellation, process logs (`Ctrl+L`), and opening completed outputs.
- NCNN/Vulkan inference and Python/PyTorch CUDA inference.

The native migration still has gaps: in-app video playback, automatic application updates, and deb/rpm/pacman/Flatpak packaging are not implemented. See [native application details](app/README.md).

## Python and PyTorch

Python is needed only for the PyTorch backend. The Rust app launches the image or video worker under `resources/python/` and reads its progress and logs.

Existing environments are reused. Selection checks the executable chosen in Settings, `TUXSCALE_PYTHON_PATH`, bundled `resources/python-env`, the TuxScale configuration environment, and `~/.venvs/tuxscale`, before falling back to `python3` on `PATH`. Choose **PyTorch (CUDA)** in Settings and use **Refresh engine status** to inspect the resolved interpreter and CUDA availability.

See [Python setup](resources/python/README.md) if an environment is not already available. Python environments are not stored in Git.

## Check and build


```sh
cargo check --locked --manifest-path app/Cargo.toml
cargo test --locked --manifest-path app/Cargo.toml
cargo fmt --manifest-path app/Cargo.toml -- --check
cargo build --locked --release --manifest-path app/Cargo.toml
```

The interactive native preview test is ignored by default because it needs a display and image fixtures.

## Linux packaging

```sh
bash app/scripts/package-linux.sh
```

This creates `app/dist/TuxScale.AppDir`. If `appimagetool` is installed, it also creates an AppImage. The AppDir contains the native executable, model files, NCNN binary, Python workers, desktop metadata, and licenses. An existing bundled Python environment is included when present; otherwise, an installed environment is used. FFmpeg and the required graphics/system libraries must be available on the destination system.

GitHub Actions builds and tests the Rust application and uploads a Linux AppDir archive. A manual **Run workflow** or a matching version tag also publishes that archive on the GitHub Releases page. The release tag follows the version in `app/Cargo.toml`; rerunning the workflow for the same version replaces its archive.

## Project structure

- `app/src/`: native UI, settings, preview, and processing orchestration.
- `app/assets/`: embedded logo and icons, with asset licenses.
- `app/vendor/`: documented compatibility patch for a GPUI dependency.
- `resources/`: model weights, NCNN executable, and Python workers.
- `scripts/`: optional backend download and Python environment setup helpers.

## Credits

TuxScale builds on [GPUI](https://gpui.rs/), [Upscayl NCNN](https://github.com/upscayl/upscayl-ncnn), and [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN). Icons are from Lucide; their license is included with the embedded assets.
