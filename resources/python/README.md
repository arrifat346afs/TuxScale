# TuxScale PyTorch Backend Setup

The **PyTorch** backend enables streaming AI video upscaling using Real-ESRGAN on NVIDIA GPUs with CUDA. Unlike batch-based file extraction, this backend decodes and encodes frames through pipes so RAM usage remains flat regardless of video length.

## System Requirements

- **GPU**: NVIDIA GPU with CUDA support
- **Python**: 3.9 - 3.12
- **Tools**: `ffmpeg` and `ffprobe` installed and accessible in your system `PATH`

## Python Environment Setup

### 1. Create and Activate a Virtual Environment (Recommended)

```bash
python3 -m venv ~/.venvs/tuxscale-pytorch
source ~/.venvs/tuxscale-pytorch/bin/activate
```

### 2. Install PyTorch with CUDA Support

Visit [PyTorch Get Started](https://pytorch.org/get-started/locally/) for your specific CUDA version, or run:

```bash
# Example for CUDA 12.1+ / 12.4
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
```

### 3. Install Real-ESRGAN and Dependencies

```bash
pip install basicsr realesrgan numpy
```

> **Note on torchvision compatibility:**
> In recent versions of `torchvision`, `torchvision.transforms.functional_tensor` was removed, which can cause older `basicsr` releases to throw an `ImportError`. TuxScale includes an automatic in-memory compatibility shim inside `tuxscale_upscale.py`. If you run into issues with external tools, installing `torchvision<=0.16.2` or upgrading `basicsr` resolves it.

### 4. Verify Installation

Run this check in your terminal:

```bash
python3 -c "import torch, realesrgan; print('CUDA Available:', torch.cuda.is_available(), '| Device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None')"
```

### 5. Configure TuxScale

1. Open TuxScale and navigate to the **Settings** tab.
2. Under **Backend**, select **PyTorch (NVIDIA)** or **Auto**.
3. If you installed packages in a custom virtual environment (e.g., `~/.venvs/tuxscale-pytorch`), enter the path to that Python interpreter in **Custom Python Path**:
   ```
   /home/yourusername/.venvs/tuxscale-pytorch/bin/python3
   ```
4. Verify that all status checks under **Engine Status** are green.

## Model Weights

Weights for `realesr-animevideov3` are automatically downloaded on first use to TuxScale's `userData` models directory (e.g. `~/.local/share/tuxscale/models/` or your OS app data directory).

If you are on an offline system, you can download `realesr-animevideov3.pth` directly and place it in the directory:

```bash
mkdir -p ~/.local/share/tuxscale/models/
wget -O ~/.local/share/tuxscale/models/realesr-animevideov3.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth
```
