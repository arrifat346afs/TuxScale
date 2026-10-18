<div align="center">
  <img src="Untitled.png" alt="TuxScale Logo" width="120" />
</div>
<h1 align="center">🐧 TuxScale</h1>

<p align="center">
  <strong>AI-powered video and image upscaling for Linux</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/electron-42.5-blue?logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/react-19.2-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/typescript-6.0-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/vite-7.2-646CFF?logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/tailwindcss-4.3-06B6D4?logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/bun-1.2-FBF0DF?logo=bun" alt="Bun" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>
<div align="center">
  <img src="/screenshots/screenshot_20260710_102004-region.png" alt="TuxScale Screenshot" width="900" />
</div>

---

## Table of Contents

- [Features](#features)
- [How it Works](#how-it-works)
- [Supported Formats](#supported-formats)
- [Prerequisites](#prerequisites)
- [Project Setup](#project-setup)
- [CI Builds](#ci-builds)
- [Tech Stack](#tech-stack)
- [Credits](#credits)

---

## Features

- **Dual AI Inference Engines**:
  - **ncnn / Vulkan** — Hardware-accelerated inference via [upscayl-ncnn](https://github.com/upscayl/upscayl-ncnn). Compatible with all modern GPUs (AMD, Intel, NVIDIA).
  - **PyTorch / CUDA** — Dedicated Python worker for NVIDIA GPUs with automatic VRAM management, half-precision (FP16), and seamless OOM-to-tile fallback.
- **Video & Image Modes** — Seamless toggle between Video and Image upscaling from the top navigation bar.
- **Single & Batch Upscaling** — Upscale single files or batch-process entire directories with real-time per-file progress tracking.
- **Interactive Before / After Comparison** — Inspect image upscaling results side-by-side using an interactive comparison slider.
- **Alpha Channel & Transparency Support** — Automatically preserves image transparency by isolating, bicubic-resizing, and recombining alpha channels.
- **Live Process Logs (`Ctrl+L`)** — Toggle real-time process stdout/stderr logs on the fly by pressing `Ctrl+L` or clicking the log button during upscaling.
- **Safe Output Handling** — Non-destructive exports that never overwrite source files, creating `<name>_upscaled.<ext>` with automatic numeric suffixes on collisions.
- **Linux Native Packaging** — AppImage, deb, rpm, and Arch Linux pacman packages.

---

## How it Works

### Video Upscaling Flow

```
Input Video (FFmpeg) ──► Extract Frames ──► Upscale Frames (ncnn / PyTorch) ──► Reassemble Video (FFmpeg) ──► Output Video
```

1. **Extract**: FFmpeg extracts frames from the input video at the original frame rate. Audio streams are extracted in parallel.
2. **Upscale**: Frames are processed in batches using either the Vulkan `upscayl-bin` runner or the PyTorch CUDA worker.
3. **Reassemble**: Upscaled frames are re-encoded with FFmpeg and remuxed with the original audio track.

### Image Upscaling Flow

```
Input Image ──► Read & EXIF Orientation ──► AI Super-Resolution (ncnn / PyTorch) ──► Alpha Blending & Encoding ──► Output Image
```

1. **Decode**: Reads the image (PNG, JPG, WebP, BMP, TIFF) with OpenCV/PIL and applies EXIF orientation.
2. **Upscale**: Uses the selected Real-ESRGAN model at 2x, 3x, or 4x scale.
3. **Save**: Encodes to the desired format (PNG, JPG, or WebP) with user-configurable quality settings.

---

## Supported Formats

| Category   | Input Formats                               | Export Formats                                  |
| ---------- | ------------------------------------------- | ----------------------------------------------- |
| **Images** | PNG, JPG, JPEG, WEBP, BMP, TIFF             | PNG (lossless), JPG, WEBP (with quality slider) |
| **Videos** | MP4, WebM, MKV, AVI, MOV, FLV, WMV, TS, M4V | MP4, MKV, WebM, MOV, AVI                        |

---

## Prerequisites

- **Git & Git LFS** — Git LFS is required when cloning the repository to pull the model weights in `resources/models/`.
- **FFmpeg & ffprobe** — Required for video frame extraction and reassembly.
- **Vulkan Driver** — Required for the ncnn/Vulkan engine (compatible with AMD, Intel, and NVIDIA GPUs).
- **NVIDIA GPU & CUDA (Optional)** — Required only if using the PyTorch CUDA engine backend.

---

## Project Setup

### Clone Repository (Requires Git LFS)

```bash
git lfs install
git clone https://github.com/arrifat346afs/TuxScale.git
cd TuxScale
```

### Install Dependencies

```bash
bun install
```

### Development

```bash
bun run dev
```

### Typecheck & Lint

```bash
bun run typecheck
bun run lint
```

### Build (Linux packages)

```bash
bun run build:linux
```

This generates distribution packages in `dist/`:

- **AppImage** — Portable Linux executable
- **.deb** — Debian / Ubuntu package
- **.rpm** — Fedora / RHEL package
- **.pkg.tar.zst** — Arch Linux pacman package

---

## CI Builds

The repository includes a GitHub Actions workflow (`.github/workflows/build.yml`) that can be triggered **manually** from the Actions tab in the GitHub UI:

1. Go to your repository on GitHub.
2. Click the **Actions** tab.
3. Select **Build Linux** from the left sidebar.
4. Click **Run workflow** → **Run workflow**.

The workflow uses Bun to build the application and packages all four Linux formats (AppImage, deb, rpm, pacman) directly into GitHub Releases.

> **Note on Git LFS & CI Bandwidth:**
> Model weights in `resources/models/*.pth` (~147 MB total) are tracked with Git LFS, requiring `lfs: true` in CI checkout and downloading ~147 MB per CI run. An effective alternative to track in future releases is downloading weights on first run / lazy-loading at runtime, or attaching weights to a GitHub release and downloading them during packaging instead of tracking binary weights inside Git LFS.

---

## Tech Stack

| Category              | Technology                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| **Desktop Framework** | [Electron](https://www.electronjs.org/)                                                                   |
| **Frontend**          | [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)                             |
| **Package Manager**   | [Bun](https://bun.sh/)                                                                                    |
| **Build Tooling**     | [electron-vite](https://electron-vite.org/) / [Vite](https://vitejs.dev/)                                 |
| **Packaging**         | [electron-builder](https://www.electron.build/)                                                           |
| **Styling & UI**      | [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)                         |
| **Inference Engines** | [upscayl-ncnn](https://github.com/upscayl/upscayl-ncnn) (Vulkan) & [PyTorch](https://pytorch.org/) (CUDA) |
| **Image Comparison**  | [react-compare-slider](https://github.com/nerdyman/react-compare-slider)                                  |

---

## Credits

TuxScale is inspired by and builds upon the fantastic work of [Upscayl](https://github.com/upscayl/upscayl) — the #1 free and open-source AI image upscaler. Special thanks to the Upscayl team for their backend ([upscayl-ncnn](https://github.com/upscayl/upscayl-ncnn)) and inspiration.
