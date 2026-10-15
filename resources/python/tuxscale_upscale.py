#!/usr/bin/env python3
"""
TuxScale PyTorch Video Upscaler - Streaming Pipeline

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

Streaming pipeline: ffmpeg decode -> raw bgr24 frames -> RealESRGANer -> ffmpeg encode
No temporary frame files. Model loaded once. Flat memory profile.
"""

import argparse
import json
import os
import subprocess
import sys
import types
import urllib.request

# Guarded shim for torchvision.transforms.functional_tensor (removed in newer torchvision)
try:
    import torchvision.transforms.functional_tensor  # noqa: F401
except ImportError:
    try:
        import torchvision.transforms.functional as _F
        _mod = types.ModuleType('torchvision.transforms.functional_tensor')
        if hasattr(_F, 'rgb_to_grayscale'):
            _mod.rgb_to_grayscale = _F.rgb_to_grayscale
        sys.modules['torchvision.transforms.functional_tensor'] = _mod
    except Exception:
        pass

try:
    import numpy as np
    import torch
except ImportError as _err:
    if '--help' in sys.argv or '-h' in sys.argv:
        np = None
        torch = None
    else:
        print(f"ERROR: Missing required Python package: {_err}", file=sys.stderr)
        print("Please install PyTorch with CUDA: pip install torch torchvision", file=sys.stderr)
        sys.exit(1)

try:
    from realesrgan.archs.srvgg_arch import SRVGGNetCompact
except ImportError:
    try:
        from basicsr.archs.srvgg_arch import SRVGGNetCompact
    except ImportError:
        SRVGGNetCompact = None

try:
    from realesrgan.utils import RealESRGANer
except ImportError:
    try:
        from realesrgan import RealESRGANer
    except ImportError:
        RealESRGANer = None


MODEL_REGISTRY = {
    'realesr-animevideov3': {
        'url': 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth',
        'netscale': 4,
        'build_model': lambda: SRVGGNetCompact(
            num_in_ch=3,
            num_out_ch=3,
            num_feat=64,
            num_conv=16,
            upscale=4,
            act_type='prelu'
        )
    }
}


def log(msg: str) -> None:
    """Print human-readable log to stderr."""
    print(msg, file=sys.stderr, flush=True)


def progress(current: int, total: int) -> None:
    """Print machine-readable progress to stdout."""
    print(f"PROGRESS {current} {total}", flush=True)


def get_default_weights_dir() -> str:
    data_home = os.environ.get('XDG_DATA_HOME', os.path.join(os.path.expanduser('~'), '.local', 'share'))
    return os.environ.get(
        'TUXSCALE_WEIGHTS_DIR',
        os.path.join(data_home, 'tuxscale', 'models')
    )


def download_weights(model_name: str, weights_dir: str) -> str:
    """Download model weights if not present. Returns path to .pth file."""
    info = MODEL_REGISTRY.get(model_name)
    if not info:
        log(f"ERROR: Unknown model '{model_name}'. Available: {list(MODEL_REGISTRY.keys())}")
        sys.exit(1)

    os.makedirs(weights_dir, exist_ok=True)
    filepath = os.path.join(weights_dir, f"{model_name}.pth")

    if os.path.exists(filepath):
        log(f"Using cached model weights: {filepath}")
        return filepath

    url = info['url']
    log(f"Model weights not found locally. Downloading {model_name}...")
    log(f"Download URL: {url}")
    log(f"Destination: {filepath}")

    tmp_path = filepath + '.tmp'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'TuxScale/1.0'})
        with urllib.request.urlopen(req, timeout=60) as resp:
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
                        log(f"Downloading weights: {pct}% ({downloaded // 1024} KB / {total_size // 1024} KB)")

        os.rename(tmp_path, filepath)
        log(f"Weights downloaded successfully to {filepath}")
        return filepath
    except Exception as err:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        log(f"ERROR: Failed to download model weights: {err}")
        log("If you are offline, download the weights manually and place them in the directory:")
        log(f"  URL: {url}")
        log(f"  Destination: {filepath}")
        sys.exit(2)


def get_video_info(input_path: str, ffmpeg_bin: str = 'ffmpeg') -> dict:
    ffprobe_bin = 'ffprobe'
    if os.path.isabs(ffmpeg_bin):
        ffprobe_bin = os.path.join(os.path.dirname(ffmpeg_bin), 'ffprobe')
        if not os.path.exists(ffprobe_bin):
            ffprobe_bin = 'ffprobe'

    cmd = [
        ffprobe_bin,
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate,nb_frames',
        '-show_entries', 'format=duration',
        '-of', 'json',
        input_path
    ]

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=30)
        data = json.loads(res.stdout)
        stream = data['streams'][0]
        width = int(stream['width'])
        height = int(stream['height'])

        fps_str = stream.get('r_frame_rate', '30/1')
        if '/' in fps_str:
            num, den = fps_str.split('/')
            fps = float(num) / float(den) if float(den) != 0 else 30.0
        else:
            fps = float(fps_str)

        nb_frames = stream.get('nb_frames')
        if nb_frames and nb_frames.isdigit() and int(nb_frames) > 0:
            total_frames = int(nb_frames)
        else:
            duration = float(data.get('format', {}).get('duration', 0))
            total_frames = int(round(fps * duration)) if duration > 0 else 0

        return {
            'width': width,
            'height': height,
            'fps': fps,
            'total_frames': total_frames
        }
    except Exception as e:
        log(f"ERROR: Failed to probe video with ffprobe: {e}")
        sys.exit(3)


def main():
    parser = argparse.ArgumentParser(description='TuxScale PyTorch Real-ESRGAN Streaming Video Upscaler')
    parser.add_argument('--input', required=True, help='Path to input video')
    parser.add_argument('--output', required=True, help='Path to output video (.mp4)')
    parser.add_argument('--model', default='realesr-animevideov3', help='Model name')
    parser.add_argument('--scale', type=int, default=4, help='Upscale factor (e.g. 2, 4)')
    parser.add_argument('--tile', type=int, default=0, help='Tile size (0 = off)')
    parser.add_argument('--fp32', action='store_true', help='Use FP32 instead of FP16')
    parser.add_argument('--ffmpeg-bin', default='ffmpeg', help='Path to ffmpeg binary')
    parser.add_argument('--weights-dir', default=None, help='Directory where model weights are stored')
    args = parser.parse_args()

    if not os.path.exists(args.input):
        log(f"ERROR: Input video not found: {args.input}")
        sys.exit(1)

    if args.model not in MODEL_REGISTRY:
        log(f"ERROR: Unsupported model '{args.model}'. Available models: {list(MODEL_REGISTRY.keys())}")
        sys.exit(1)

    if not torch.cuda.is_available():
        log("ERROR: CUDA is not available. PyTorch backend requires an NVIDIA GPU with CUDA.")
        sys.exit(1)

    if RealESRGANer is None:
        log("ERROR: 'realesrgan' package is not installed. Run: pip install realesrgan")
        sys.exit(1)

    if SRVGGNetCompact is None:
        log("ERROR: SRVGGNetCompact architecture not found in realesrgan or basicsr.")
        sys.exit(1)

    weights_dir = args.weights_dir or get_default_weights_dir()
    model_path = download_weights(args.model, weights_dir)

    # Probe input video
    vinfo = get_video_info(args.input, args.ffmpeg_bin)
    in_w = vinfo['width']
    in_h = vinfo['height']
    fps = vinfo['fps']
    total_frames = vinfo['total_frames']

    log(f"Input: {args.input} ({in_w}x{in_h} @ {fps:.2f}fps, ~{total_frames} frames)")
    log(f"Target scale: {args.scale}x -> {in_w * args.scale}x{in_h * args.scale}")

    # Build model (loaded ONCE)
    model_cfg = MODEL_REGISTRY[args.model]
    net = model_cfg['build_model']()
    half = (not args.fp32) and torch.cuda.is_available()

    log(f"Loading Real-ESRGAN model (tile={args.tile}, half={half})...")
    try:
        upsampler = RealESRGANer(
            scale=model_cfg['netscale'],
            model_path=model_path,
            model=net,
            tile=args.tile,
            tile_pad=10,
            pre_pad=0,
            half=half,
            gpu_id=0
        )
    except Exception as e:
        log(f"ERROR: Failed to initialize RealESRGANer: {e}")
        sys.exit(1)

    out_w = in_w * args.scale
    out_h = in_h * args.scale
    frame_in_bytes = in_w * in_h * 3

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    # 1. Decoder process: streams raw bgr24 frames to stdout
    decode_cmd = [
        args.ffmpeg_bin,
        '-v', 'error',
        '-i', args.input,
        '-f', 'image2pipe',
        '-pix_fmt', 'bgr24',
        '-vcodec', 'rawvideo',
        'pipe:1'
    ]

    # 2. Encoder process: reads raw bgr24 frames from stdin and encodes to H.264
    encode_cmd = [
        args.ffmpeg_bin,
        '-v', 'error',
        '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-s', f"{out_w}x{out_h}",
        '-pix_fmt', 'bgr24',
        '-r', str(fps),
        '-i', 'pipe:0',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-crf', '18',
        '-preset', 'medium',
        '-an',
        args.output
    ]

    log("Starting streaming pipeline...")
    decoder = subprocess.Popen(decode_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=10**7)
    encoder = subprocess.Popen(encode_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=10**7)

    processed_frames = 0
    try:
        while True:
            raw_frame = decoder.stdout.read(frame_in_bytes)
            if not raw_frame or len(raw_frame) < frame_in_bytes:
                break

            # Convert to numpy array (height, width, BGR)
            frame = np.frombuffer(raw_frame, dtype=np.uint8).reshape((in_h, in_w, 3))

            # Upscale with RealESRGANer (model handles tiling and outscale)
            with torch.no_grad():
                upscaled, _ = upsampler.enhance(frame, outscale=args.scale)

            # Write raw upscaled frame to encoder stdin
            encoder.stdin.write(upscaled.tobytes())

            processed_frames += 1
            cur_total = max(total_frames, processed_frames)
            progress(processed_frames, cur_total)

        # Finished sending frames
        if encoder.stdin:
            encoder.stdin.close()

        decoder.stdout.close()
        dec_err = decoder.stderr.read().decode('utf-8', errors='ignore') if decoder.stderr else ''
        enc_err = encoder.stderr.read().decode('utf-8', errors='ignore') if encoder.stderr else ''

        dec_code = decoder.wait()
        enc_code = encoder.wait()

        if dec_code != 0:
            log(f"ERROR: Decoder failed with exit code {dec_code}: {dec_err}")
            sys.exit(dec_code)

        if enc_code != 0:
            log(f"ERROR: Encoder failed with exit code {enc_code}: {enc_err}")
            sys.exit(enc_code)

        progress(processed_frames, processed_frames)
        log(f"Upscaling successfully finished! {processed_frames} frames encoded to {args.output}")

    except KeyboardInterrupt:
        log("Process cancelled by user.")
        sys.exit(130)
    except Exception as e:
        log(f"ERROR: Streaming pipeline error: {e}")
        sys.exit(1)
    finally:
        for p in [decoder, encoder]:
            try:
                if p.poll() is None:
                    p.kill()
            except Exception:
                pass


if __name__ == '__main__':
    main()
