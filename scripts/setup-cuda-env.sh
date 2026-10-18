#!/bin/bash
set -euo pipefail

# TARGET_DIR defaults to ~/.config/tuxscale/pytorch-env
TARGET_DIR="${1:-$HOME/.config/tuxscale/pytorch-env}"
MODELS_DIR="${2:-$HOME/.config/tuxscale/models}"

echo "PROGRESS:5:Initializing target directory..."
mkdir -p "$TARGET_DIR"
mkdir -p "$MODELS_DIR"

PYTHON_VERSION="3.11.10"
STANDALONE_RELEASE="20241016"
PYTHON_BIN="$TARGET_DIR/bin/python3"

# 1. Download portable standalone Python if not already executable
if [ ! -x "$PYTHON_BIN" ]; then
  echo "PROGRESS:15:Downloading portable Python ${PYTHON_VERSION} runtime..."
  TAR_NAME="cpython-${PYTHON_VERSION}+${STANDALONE_RELEASE}-x86_64-unknown-linux-gnu-install_only.tar.gz"
  DOWNLOAD_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${STANDALONE_RELEASE}/${TAR_NAME}"
  
  TEMP_TAR="$(mktemp --suffix=.tar.gz)"
  curl -fSL -o "$TEMP_TAR" "$DOWNLOAD_URL"
  
  echo "PROGRESS:25:Extracting portable Python runtime..."
  TEMP_EXTRACT="$(mktemp -d)"
  tar -xzf "$TEMP_TAR" -C "$TEMP_EXTRACT"
  
  rm -rf "$TARGET_DIR"/*
  cp -r "$TEMP_EXTRACT/python/"* "$TARGET_DIR/"
  rm -rf "$TEMP_TAR" "$TEMP_EXTRACT"
  chmod +x "$PYTHON_BIN"
fi

# 2. Upgrade pip and build tools
echo "PROGRESS:35:Upgrading pip and packaging tools..."
"$PYTHON_BIN" -m pip install --no-cache-dir --upgrade pip setuptools wheel

# 3. Install PyTorch with CUDA 12.4
echo "PROGRESS:50:Downloading and installing PyTorch with CUDA 12.4 (this may take a few minutes)..."
"$PYTHON_BIN" -m pip install --no-cache-dir \
  torch torchvision \
  --index-url https://download.pytorch.org/whl/cu124

# 4. Install Real-ESRGAN, BasicSR, Spandrel, and NumPy
echo "PROGRESS:75:Installing Real-ESRGAN, BasicSR, and Spandrel..."
"$PYTHON_BIN" -m pip install --no-cache-dir \
  basicsr realesrgan spandrel numpy \
  --no-build-isolation

# 5. Patch BasicSR compatibility with modern torchvision
find "$TARGET_DIR" -type f -name "degradations.py" -exec sed -i \
  's/torchvision\.transforms\.functional_tensor/torchvision.transforms.functional/g' {} + 2>/dev/null || true

SITE_PACKAGES="$("$PYTHON_BIN" -c "import site; print(site.getsitepackages()[0])")"
cat << 'EOF' > "$SITE_PACKAGES/sitecustomize.py"
import sys
import types
try:
    import torchvision.transforms.functional_tensor
except ImportError:
    try:
        import torchvision.transforms
        import torchvision.transforms.functional as _F
        _mod = types.ModuleType('torchvision.transforms.functional_tensor')
        for _attr in dir(_F):
            if not _attr.startswith('__'):
                setattr(_mod, _attr, getattr(_F, _attr))
        sys.modules['torchvision.transforms.functional_tensor'] = _mod
        setattr(torchvision.transforms, 'functional_tensor', _mod)
    except Exception:
        pass
EOF

# 6. Verify environment
echo "PROGRESS:88:Verifying PyTorch CUDA acceleration..."
"$PYTHON_BIN" -c "import torch, torchvision, realesrgan, basicsr, spandrel, numpy; print('✓ Verification passed: Torch', torch.__version__, '| CUDA:', torch.version.cuda, '| Available:', torch.cuda.is_available())"

# 7. Download default PyTorch model if missing
WEIGHTS_PATH="$MODELS_DIR/realesr-animevideov3.pth"
if [ ! -f "$WEIGHTS_PATH" ] || [ "$(stat -c%s "$WEIGHTS_PATH")" -lt 1048576 ] || head -n 1 "$WEIGHTS_PATH" 2>/dev/null | grep -q "^version https://git-lfs"; then
  echo "PROGRESS:95:Downloading default PyTorch model (realesr-animevideov3.pth)..."
  curl -fSL -o "$WEIGHTS_PATH" \
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth"
fi

echo "PROGRESS:100:PyTorch CUDA environment ready at $TARGET_DIR"
