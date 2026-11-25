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
- Embedded muted video preview with play/pause, seeking, and a synchronized before/after reveal slider for completed videos.
- Progress, cancellation, process logs (`Ctrl+L`), and opening completed outputs.
- NCNN/Vulkan inference and Python/PyTorch CUDA inference.

Video previews are muted and decoded at up to 960×540 for responsive playback; exported video retains its original audio handling and selected upscale resolution. Automatic application updates and Flatpak packaging are not implemented. See [native application details](app/README.md).

## Python and PyTorch

Python is needed only for the PyTorch backend. The Rust app launches the image or video worker under `resources/python/` and reads its progress and logs.

Packaged builds include a Python and PyTorch CUDA environment alongside the native app; users do not need to install Python. Selection checks the executable chosen in Settings, `TUXSCALE_PYTHON_PATH`, then the bundled `resources/python-env`. Development builds can also use the TuxScale configuration environment, `~/.venvs/tuxscale`, or `python3` on `PATH`. Choose **PyTorch (CUDA)** in Settings and use **Refresh engine status** to inspect the resolved interpreter and CUDA availability.

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

This creates `app/dist/TuxScale.AppDir`. If `appimagetool` is installed, it also creates an AppImage. The AppDir contains the native executable, model files, NCNN binary, Python workers and their CUDA environment, desktop metadata, and licenses. `app/scripts/bundle-python.sh` reuses a prepared `resources/python-env` or builds one into the AppDir and verifies its imports. FFmpeg and the required graphics/system libraries must be available on the destination system.

GitHub Actions runs `bash app/scripts/package-formats.sh` to build AppImage, Debian `.deb`, Fedora `.rpm`, Arch/Pacman `.pkg.tar.zst`, and AppDir archives, plus `SHA256SUMS`. A manual **Run workflow** on `main` or a matching version tag publishes all formats on the GitHub Releases page. The release tag follows the version in `app/Cargo.toml`; rerunning the workflow for the same version replaces its packages. To retry a successful build without rebuilding, enter its Actions run ID in the `release_run_id` workflow input. Local packaging requires FPM 1.17.0, Ruby, RPM tools, dpkg-deb, bsdtar, zstd, and squashfs-tools; the workflow installs these dependencies.

Assets larger than GitHub's 2 GiB limit are published as numbered `.part00`, `.part01` files. Download every part of the package you want and `SHA256SUMS`, then reassemble and verify it. For example:

```sh
package=TuxScale-2.0.1-x86_64.AppImage
cat "$package".part* > "$package"
grep -F "  $package" SHA256SUMS | sha256sum -c -
```

Release binaries target x86-64 and glibc 2.39 or newer (Ubuntu 24.04+, Fedora 40+, and current Arch Linux). AppImage includes linked application libraries and a Python/PyTorch CUDA environment but requires the host graphics drivers and FFmpeg. Package-manager formats declare their runtime dependencies and include the same Python environment.

## Project structure

- `app/src/`: native UI, settings, preview, and processing orchestration.
- `app/assets/`: embedded logo and icons, with asset licenses.
- `app/vendor/`: documented compatibility patch for a GPUI dependency.
- `resources/`: model weights, NCNN executable, and Python workers.
- `scripts/`: optional backend download and Python environment setup helpers.

## Credits

TuxScale builds on [GPUI](https://gpui.rs/), [Upscayl NCNN](https://github.com/upscayl/upscayl-ncnn), and [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN). Icons are from Lucide; their license is included with the embedded assets.

## Developer documentation

See the [developer guide](docs/DEVELOPMENT.md) for the Rust/GPUI component structure, state and events, responsive layout, video comparison, processing backends, and packaging.
