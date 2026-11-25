#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
appdir="${1:?Pass the AppDir path}"
target="$appdir/usr/share/tuxscale/resources/python-env"
source_env="$project_dir/resources/python-env"

rm -rf "$target"
if [ -x "$source_env/bin/python3" ]; then
  cp -a "$source_env" "$target"
else
  bash "$project_dir/resources/python/setup-cuda-env.sh" "$target" "$appdir/usr/share/tuxscale/resources/models"
fi

"$target/bin/python3" - "$target" <<'PY'
import pathlib
import sys
import torch, torchvision, realesrgan, basicsr, spandrel, numpy, cv2

assert pathlib.Path(sys.prefix).resolve() == pathlib.Path(sys.argv[1]).resolve(), sys.prefix
assert torch.version.cuda, "Bundled PyTorch must support CUDA"
print(f"Bundled Python {sys.version.split()[0]}, PyTorch {torch.__version__}, CUDA {torch.version.cuda}")
PY
