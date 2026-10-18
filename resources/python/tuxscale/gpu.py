"""
TuxScale PyTorch GPU Acceleration and Real-ESRGAN Inference.

Based on Real-ESRGAN (https://github.com/xinntao/Real-ESRGAN)
Original work Copyright (c) 2021, Xintao Wang
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
"""

import math
import os
import sys
import time
import urllib.request
from typing import Dict, Any, Optional, Tuple, Callable

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

try:
    from spandrel import ModelLoader, ImageModelDescriptor
except ImportError:
    ModelLoader = None
    ImageModelDescriptor = None


MODEL_REGISTRY: Dict[str, Dict[str, Any]] = {
    'realesr-animevideov3': {
        'url': 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth',
        'display_name': 'Real-ESRGAN AnimeVideo v3',
        'kind': 'video+image'
    },
    'realesr-general-wdn-x4v3': {
        'url': 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-wdn-x4v3.pth',
        'display_name': 'Real-ESRGAN General WDN v3',
        'kind': 'video+image'
    },
    '4x-UltraSharpV2': {
        'url': 'https://huggingface.co/Kim2091/UltraSharpV2/resolve/main/4x-UltraSharpV2.pth',
        'display_name': '4x-UltraSharpV2',
        'kind': 'image-only'
    }
}


def is_lfs_pointer(filepath: str) -> bool:
    """Check if file is a Git LFS pointer stub instead of actual model weights."""
    try:
        if not os.path.isfile(filepath):
            return False
        # Git LFS pointer stubs are ~130 bytes; actual model weights are > 1MB
        if os.path.getsize(filepath) < 1024 * 1024:
            with open(filepath, 'rb') as f:
                header = f.read(100)
                if header.startswith(b'version https://git-lfs'):
                    return True
    except Exception:
        pass
    return False


def get_weights_search_dirs(weights_dir: Optional[str] = None) -> list:
    """
    Returns ordered list of directories to search for model weights:
    1. resources/models in current working directory (project root)
    2. models in current working directory (project root)
    3. Directory relative to this package: resources/models and project_root/models
    4. Explicit weights_dir argument if passed
    5. TUXSCALE_WEIGHTS_DIR environment variable if set
    6. System / user config & data directories (userData/models, ~/.local/share/tuxscale/models)
    """
    dirs = []

    cwd = os.getcwd()
    dirs.append(os.path.join(cwd, 'resources', 'models'))
    dirs.append(os.path.join(cwd, 'models'))

    pkg_dir = os.path.dirname(os.path.abspath(__file__))
    resources_dir = os.path.dirname(os.path.dirname(pkg_dir))
    dirs.append(os.path.join(resources_dir, 'models'))
    project_root = os.path.dirname(resources_dir)
    dirs.append(os.path.join(project_root, 'models'))

    if weights_dir:
        dirs.append(os.path.abspath(weights_dir))

    if 'TUXSCALE_WEIGHTS_DIR' in os.environ:
        dirs.append(os.environ['TUXSCALE_WEIGHTS_DIR'])

    config_home = os.environ.get('XDG_CONFIG_HOME', os.path.join(os.path.expanduser('~'), '.config'))
    dirs.append(os.path.join(config_home, 'tuxscale', 'models'))

    data_home = os.environ.get('XDG_DATA_HOME', os.path.join(os.path.expanduser('~'), '.local', 'share'))
    dirs.append(os.path.join(data_home, 'tuxscale', 'models'))

    seen = set()
    result = []
    for d in dirs:
        norm = os.path.normpath(d)
        if norm not in seen:
            seen.add(norm)
            result.append(norm)
    return result


def get_default_weights_dir() -> str:
    search_dirs = get_weights_search_dirs()
    for d in search_dirs:
        if os.path.exists(d):
            return d
    return search_dirs[0]


def download_weights(model_name: str, weights_dir: Optional[str] = None, log_fn: Optional[Callable[[str], None]] = None) -> str:
    """Download or locate model weights. Checks candidate directories first."""
    def _log(msg: str):
        if log_fn:
            log_fn(msg)
        else:
            print(msg, file=sys.stderr, flush=True)

    target_filename = f"{model_name}.pth"
    search_dirs = get_weights_search_dirs(weights_dir)

    # 1. Search for existing model weights in all candidate directories (project root first)
    for d in search_dirs:
        candidate = os.path.join(d, target_filename)
        if os.path.exists(candidate):
            if is_lfs_pointer(candidate):
                _log(f"WARNING: '{candidate}' is a Git LFS pointer stub (~{os.path.getsize(candidate)} bytes), skipping and continuing search...")
                continue
            _log(f"Using model weights: {candidate}")
            return candidate

    # 2. If not found on disk, check if it can be downloaded via MODEL_REGISTRY
    info = MODEL_REGISTRY.get(model_name)
    if not info:
        _log(f"ERROR: could not load {model_name}: weights not found on disk and not in MODEL_REGISTRY")
        sys.exit(1)

    # 3. Select first writable target directory to download
    dest_dir = None
    if weights_dir:
        try:
            os.makedirs(weights_dir, exist_ok=True)
            test_file = os.path.join(weights_dir, '.write_test')
            with open(test_file, 'w') as f:
                f.write('ok')
            os.remove(test_file)
            dest_dir = weights_dir
        except (OSError, PermissionError):
            pass

    if not dest_dir:
        for d in search_dirs:
            try:
                os.makedirs(d, exist_ok=True)
                test_file = os.path.join(d, '.write_test')
                with open(test_file, 'w') as f:
                    f.write('ok')
                os.remove(test_file)
                dest_dir = d
                break
            except (OSError, PermissionError):
                continue

    if not dest_dir:
        dest_dir = os.path.join(os.path.expanduser('~'), '.cache', 'tuxscale', 'models')
        os.makedirs(dest_dir, exist_ok=True)

    filepath = os.path.join(dest_dir, target_filename)

    url = info['url']
    _log(f"Model weights '{target_filename}' not found on disk.")
    _log(f"Downloading {model_name}...")
    _log(f"Download URL: {url}")
    _log(f"Destination: {filepath}")

    tmp_path = filepath + '.tmp'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'TuxScale/1.0'})
        with urllib.request.urlopen(req, timeout=120) as resp:
            total_size = int(resp.headers.get('Content-Length', 0))
            downloaded = 0
            block_size = 65536
            with open(tmp_path, 'wb') as f:
                while True:
                    chunk = resp.read(block_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        pct = int(downloaded * 100 / total_size)
                        _log(f"Downloading weights: {pct}% ({downloaded // 1024} KB / {total_size // 1024} KB)")

        os.rename(tmp_path, filepath)
        _log(f"Weights downloaded successfully to {filepath}")
        return filepath
    except Exception as err:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        _log(f"ERROR: could not load {model_name}: download failed ({err})")
        _log("If you are offline, download the weights manually and place them in the directory:")
        _log(f"  URL: {url}")
        _log(f"  Destination: {filepath}")
        sys.exit(2)


def load_model(
    model_name: str,
    weights_path: str,
    device: torch.device,
    half: bool = True,
    channels_last: bool = True,
    log_fn: Optional[Callable[[str], None]] = None
) -> Tuple[Any, int, bool]:
    """
    Build and load weights into the model using spandrel ModelLoader.
    Detects architecture automatically from weights file.
    Returns (descriptor, scale, half_precision_used).
    """
    def _log(msg: str):
        if log_fn:
            log_fn(msg)
        else:
            print(msg, file=sys.stderr, flush=True)

    torch.backends.cudnn.benchmark = True

    try:
        from spandrel import ModelLoader
        loader = ModelLoader()
        descriptor = loader.load_from_file(weights_path)
    except Exception as e:
        raise RuntimeError(str(e)) from e

    scale = getattr(descriptor, 'scale', 4)
    descriptor = descriptor.eval()

    supports_half = getattr(descriptor, 'supports_half', False)
    use_half = False
    if half:
        if supports_half:
            descriptor = descriptor.half()
            use_half = True
        else:
            descriptor = descriptor.float()
            use_half = False
            _log(f"Model '{model_name}' does not support FP16 half-precision; falling back to FP32.")
    else:
        descriptor = descriptor.float()
        use_half = False

    descriptor = descriptor.to(device=device)

    if channels_last:
        try:
            descriptor.model.to(memory_format=torch.channels_last)
        except Exception:
            pass

    return descriptor, scale, use_half


def forward_tiled_gpu(
    model: Any,
    x: torch.Tensor,
    tile_size: int = 512,
    tile_pad: int = 10,
    net_scale: int = 4
) -> torch.Tensor:
    """
    Tiled model execution entirely on GPU tensor without host transfers.
    x is (B, C, H, W) on GPU.
    """
    b, c, h, w = x.shape
    tiles_x = math.ceil(w / tile_size)
    tiles_y = math.ceil(h / tile_size)
    out = torch.empty((b, c, h * net_scale, w * net_scale), dtype=x.dtype, device=x.device)

    for i in range(tiles_y):
        for j in range(tiles_x):
            ofs_x = j * tile_size
            ofs_y = i * tile_size
            input_start_x = max(0, ofs_x - tile_pad)
            input_end_x = min(w, ofs_x + tile_size + tile_pad)
            input_start_y = max(0, ofs_y - tile_pad)
            input_end_y = min(h, ofs_y + tile_size + tile_pad)

            tile_in = x[:, :, input_start_y:input_end_y, input_start_x:input_end_x]
            with torch.inference_mode():
                tile_out = model(tile_in)

            pad_left = (ofs_x - input_start_x) * net_scale
            pad_top = (ofs_y - input_start_y) * net_scale
            valid_w = min(tile_size, w - ofs_x) * net_scale
            valid_h = min(tile_size, h - ofs_y) * net_scale

            out[:, :, ofs_y * net_scale : ofs_y * net_scale + valid_h, ofs_x * net_scale : ofs_x * net_scale + valid_w] = (
                tile_out[:, :, pad_top : pad_top + valid_h, pad_left : pad_left + valid_w]
            )

    return out


class GpuUpscaler:
    """
    Direct GPU pre/post-processing and inference pipeline.
    Avoids CPU roundtrips, float conversions, and unnecessary stitching.
    """

    def __init__(
        self,
        model: Any,
        device: torch.device,
        target_scale: int = 4,
        net_scale: int = 4,
        tile_size: int = 0,
        half: bool = True,
        channels_last: bool = True,
        log_fn: Optional[Callable[[str], None]] = None
    ):
        self.model = model
        self.device = device
        self.target_scale = target_scale
        self.net_scale = net_scale
        self.tile_size = tile_size
        self.half = half
        self.dtype = torch.float16 if half else torch.float32
        self.channels_last = channels_last
        self.log_fn = log_fn or (lambda msg: print(msg, file=sys.stderr, flush=True))
        self.oom_occurred = False

    def upscale_frame_direct(
        self,
        frame_uint8_cpu: np.ndarray,
        copy_stream: Optional[torch.cuda.Stream] = None,
        compute_stream: Optional[torch.cuda.Stream] = None
    ) -> Tuple[np.ndarray, float, float, float, float]:
        """
        Takes raw HxWx3 uint8 BGR numpy array from host.
        Returns: (output_uint8_bgr_cpu, h2d_ms, model_ms, post_ms, d2h_ms)
        """
        h_in, w_in, _ = frame_uint8_cpu.shape
        c_stream = compute_stream or torch.cuda.current_stream()
        cp_stream = copy_stream or torch.cuda.current_stream()

        ev_h2d_start = torch.cuda.Event(enable_timing=True)
        ev_h2d_end = torch.cuda.Event(enable_timing=True)
        ev_model_start = torch.cuda.Event(enable_timing=True)
        ev_model_end = torch.cuda.Event(enable_timing=True)
        ev_post_start = torch.cuda.Event(enable_timing=True)
        ev_post_end = torch.cuda.Event(enable_timing=True)
        ev_d2h_start = torch.cuda.Event(enable_timing=True)
        ev_d2h_end = torch.cuda.Event(enable_timing=True)

        # 1. Host -> GPU Transfer
        t_in = torch.from_numpy(frame_uint8_cpu)
        if not t_in.is_pinned():
            try:
                t_in = t_in.pin_memory()
            except Exception:
                pass

        with torch.cuda.stream(cp_stream):
            ev_h2d_start.record(cp_stream)
            t_gpu = t_in.to(self.device, non_blocking=True)
            ev_h2d_end.record(cp_stream)

        c_stream.wait_stream(cp_stream)

        # 2. Pre-process & 3. Model Forward on compute stream
        with torch.cuda.stream(c_stream):
            with torch.inference_mode():
                # (H, W, 3) BGR -> (1, 3, H, W) RGB float in [0.0, 1.0]
                x = t_gpu.permute(2, 0, 1).unsqueeze(0)
                x = x[:, [2, 1, 0], :, :]
                x = x.to(dtype=self.dtype).div_(255.0)
                if self.channels_last:
                    try:
                        x = x.to(memory_format=torch.channels_last)
                    except Exception:
                        pass

                ev_model_start.record(c_stream)
                try:
                    if self.tile_size > 0 or self.oom_occurred:
                        active_tile = self.tile_size if self.tile_size > 0 else 512
                        out = forward_tiled_gpu(self.model, x, tile_size=active_tile, net_scale=self.net_scale)
                    else:
                        out = self.model(x)
                except (torch.cuda.OutOfMemoryError, RuntimeError) as e:
                    if 'out of memory' in str(e).lower() or isinstance(e, torch.cuda.OutOfMemoryError):
                        self.log_fn(f"[GPU] CUDA OutOfMemoryError detected! Retrying frame with tiling (tile=512)...")
                        torch.cuda.empty_cache()
                        self.oom_occurred = True
                        out = forward_tiled_gpu(self.model, x, tile_size=512, net_scale=self.net_scale)
                    else:
                        raise
                ev_model_end.record(c_stream)

                # 4. Post-processing on GPU
                ev_post_start.record(c_stream)
                # Resize from net_scale (4x) to target_scale if different
                if self.target_scale != self.net_scale:
                    target_h = int(round(h_in * self.target_scale))
                    target_w = int(round(w_in * self.target_scale))
                    try:
                        out = F.interpolate(out, size=(target_h, target_w), mode='bicubic', antialias=True)
                    except Exception:
                        # Fall back to fp32 if fp16 bicubic antialias throws on older CUDA
                        out = F.interpolate(out.float(), size=(target_h, target_w), mode='bicubic', antialias=True).to(self.dtype)

                # Clamp, scale to 255, round, cast to uint8
                out = out.clamp_(0.0, 1.0).mul_(255.0).round_().to(torch.uint8)

                # RGB back to BGR and permute to (H_out, W_out, 3)
                out = out[:, [2, 1, 0], :, :]
                out = out.squeeze(0).permute(1, 2, 0).contiguous()
                ev_post_end.record(c_stream)

        # 5. GPU -> Host Transfer on copy stream
        cp_stream.wait_stream(c_stream)
        with torch.cuda.stream(cp_stream):
            ev_d2h_start.record(cp_stream)
            out_cpu = out.to('cpu', non_blocking=True)
            ev_d2h_end.record(cp_stream)

        cp_stream.synchronize()

        h2d_ms = max(0.0, ev_h2d_start.elapsed_time(ev_h2d_end))
        model_ms = max(0.0, ev_model_start.elapsed_time(ev_model_end))
        post_ms = max(0.0, ev_post_start.elapsed_time(ev_post_end))
        d2h_ms = max(0.0, ev_d2h_start.elapsed_time(ev_d2h_end))

        out_numpy = out_cpu.numpy()
        return out_numpy, h2d_ms, model_ms, post_ms, d2h_ms

