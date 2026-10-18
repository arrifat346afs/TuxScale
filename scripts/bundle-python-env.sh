#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PYTHON_VERSION="3.11.10"
STANDALONE_RELEASE="20241016"
TARGET_DIR="$ROOT_DIR/resources/python-env"
MODELS_DIR="$ROOT_DIR/resources/models"

echo "==> Setting up bundled Python & PyTorch environment in $TARGET_DIR..."

mkdir -p "$TARGET_DIR"
mkdir -p "$MODELS_DIR"

PYTHON_BIN="$TARGET_DIR/bin/python3"

# 1. Download portable standalone Python if not already present
if [ ! -x "$PYTHON_BIN" ]; then
  TAR_NAME="cpython-${PYTHON_VERSION}+${STANDALONE_RELEASE}-x86_64-unknown-linux-gnu-install_only.tar.gz"
  DOWNLOAD_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${STANDALONE_RELEASE}/${TAR_NAME}"
  
  echo "Downloading standalone Python ${PYTHON_VERSION} from: $DOWNLOAD_URL"
  TEMP_TAR="$(mktemp --suffix=.tar.gz)"
  curl -sfL -o "$TEMP_TAR" "$DOWNLOAD_URL"
  
  echo "Extracting standalone Python to temporary location..."
  TEMP_EXTRACT="$(mktemp -d)"
  tar -xzf "$TEMP_TAR" -C "$TEMP_EXTRACT"
  
  rm -rf "$TARGET_DIR"
  mkdir -p "$TARGET_DIR"
  cp -r "$TEMP_EXTRACT/python/"* "$TARGET_DIR/"
  
  rm -rf "$TEMP_TAR" "$TEMP_EXTRACT"
  chmod +x "$PYTHON_BIN"
  echo "Standalone Python ${PYTHON_VERSION} unpacked successfully."
else
  echo "Standalone Python binary already exists at: $PYTHON_BIN"
fi

# 2. Upgrade pip and build tools
echo "==> Upgrading pip and essential wheel tools..."
"$PYTHON_BIN" -m pip install --no-cache-dir --upgrade pip setuptools wheel

# 3. Install PyTorch with CUDA 12.4
echo "==> Installing PyTorch and torchvision with CUDA 12.4..."
"$PYTHON_BIN" -m pip install --no-cache-dir \
  torch torchvision \
  --index-url https://download.pytorch.org/whl/cu124

# 4. Install Real-ESRGAN, basicsr, spandrel, and numpy
echo "==> Installing Real-ESRGAN, basicsr, spandrel, and dependencies..."
"$PYTHON_BIN" -m pip install --no-cache-dir \
  basicsr realesrgan spandrel numpy \
  --no-build-isolation

# 4b. Patch BasicSR compatibility with modern torchvision (torchvision >= 0.17 removed functional_tensor)
echo "==> Patching BasicSR compatibility with torchvision..."
find "$TARGET_DIR" -type f -name "degradations.py" -exec sed -i \
  's/torchvision\.transforms\.functional_tensor/torchvision.transforms.functional/g' {} +

# Add sitecustomize.py to ensure backward compatibility across all imports in the bundled environment
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

# 5. Verify installation
echo "==> Verifying bundled Python packages..."
"$PYTHON_BIN" -c "import torch, torchvision, realesrgan, basicsr, spandrel, numpy; print('✓ Bundled Python verification passed: Torch', torch.__version__, '| CUDA:', torch.version.cuda)"
"$PYTHON_BIN" -c "from basicsr.data.degradations import rgb_to_grayscale; print('✓ BasicSR degradations import verified')"
"$PYTHON_BIN" -c "from spandrel import ModelLoader; print('✓ Spandrel ModelLoader import verified')"
"$PYTHON_BIN" "$ROOT_DIR/resources/python/tuxscale_upscale.py" --help > /dev/null
echo "✓ Verified tuxscale_upscale.py entrypoint execution"

# 6. Download default PyTorch model weights (realesr-animevideov3.pth)
WEIGHTS_PATH="$MODELS_DIR/realesr-animevideov3.pth"
if [ ! -f "$WEIGHTS_PATH" ] || [ "$(stat -c%s "$WEIGHTS_PATH")" -lt 1048576 ] || head -n 1 "$WEIGHTS_PATH" | grep -q "^version https://git-lfs"; then
  echo "==> Downloading default PyTorch model (realesr-animevideov3.pth)..."
  curl -sfL -o "$WEIGHTS_PATH" \
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth"
  echo "✓ Saved model to: $WEIGHTS_PATH"
else
  echo "Model weights already present at: $WEIGHTS_PATH"
fi

# 7. Clean up unneeded files to minimize package size
echo "==> Cleaning unneeded files to optimize package size..."
rm -rf "$TARGET_DIR/include"
rm -rf "$TARGET_DIR/share"
find "$TARGET_DIR" -name "*.a" -type f -delete || true
find "$TARGET_DIR" -type d \( -name "tests" -o -name "test" \) -prune -exec rm -rf {} + 2>/dev/null || true
find "$TARGET_DIR" -type d -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true

echo "✓ Bundled Python environment ready at: $TARGET_DIR"
