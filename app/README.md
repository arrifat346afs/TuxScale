# TuxScale Rust + GPUI

This is the native desktop rewrite of TuxScale. It uses GPUI for the desktop UI and Rust for job orchestration. It reads the repository's existing model assets and launches the existing NCNN executable or PyTorch Python workers so the inference engines remain available during the UI/backend rewrite.

## Run

```sh
cd rust-app
cargo run
```

Create a Linux AppDir and, when `appimagetool` is installed, an AppImage:

```sh
bash rust-app/scripts/package-linux.sh
```

## Implemented

- Interface scale defaults to 80%; Settings → Interface Scale adjusts and saves the size of text, spacing, icons, and controls together.
- GPUI desktop window matching the original four-step sidebar, top Videos/Images tabs, dark theme, logo, and Lucide icons.
- Scrollable sidebar, selectable dropdown menus with keyboard navigation and outside-click dismissal, and draggable scale/quality sliders.
- Drag and drop input, double-click file selection, and Ctrl+L process logs.
- Native file and folder pickers, output folder selection, and persisted preferences.
- Backend/model/scale/output settings, custom Python path, tile/TTA/low-VRAM controls, image quality, frame batch size, PyTorch video encoder selection, and duplicate-frame handling.
- Single-file and folder image/video jobs with output collision protection.
- NCNN image/video execution through `upscayl-bin` and FFmpeg.
- PyTorch image/video execution through the existing CUDA worker scripts.
- PyTorch CUDA environment setup with live installer progress and cancellation.
- Video audio remuxing and audio-only extraction.
- Full-area, aspect-preserving single-image preview; completed images use an aligned before/after reveal slider with mouse dragging and arrow/Home/End keyboard controls.
- Live worker logs, progress, cancellation, and opening the completed result.

## Python and PyTorch

The PyTorch backend uses Python. Rust starts the existing `resources/python/tuxscale_upscale_images.py` or `resources/python/tuxscale_upscale.py` worker as a child process and receives its logs and progress. NCNN does not use Python.

Python selection checks the custom executable in Settings, then `TUXSCALE_PYTHON_PATH`, the bundled `resources/python-env`, the TuxScale environment under the configuration directory, `~/.config/tuxscale/pytorch-env`, and `~/.venvs/tuxscale`, before falling back to `python3` on PATH. An existing working PyTorch/CUDA environment can be reused without installing another one. Refresh Engine Status shows the resolved executable and CUDA status.

## Remaining parity work

- In-app video preview.
- Expanded engine readiness checks and application update handling.
- deb, rpm, and pacman packaging plus release workflow migration.

Linux video processing requires FFmpeg and FFprobe on `PATH`. Inference also requires the bundled `resources/linux/bin/upscayl-bin` and the models under `resources/models`, or a working Python/PyTorch CUDA environment when PyTorch is selected. The legacy Electron/JavaScript application has been removed.
