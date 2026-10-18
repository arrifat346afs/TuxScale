"""
TuxScale PyTorch Real-ESRGAN Image Upscaler.
Supports single and batch image processing with alpha preservation,
EXIF orientation handling, 16-bit/grayscale normalization, and OOM auto-tiling.
"""

import argparse
import json
import math
import os
import signal
import sys
from typing import List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps
import torch

from tuxscale.gpu import (
    MODEL_REGISTRY,
    get_default_weights_dir,
    download_weights,
    load_model,
    GpuUpscaler
)


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def progress(current: int, total: int) -> None:
    print(f"PROGRESS {current} {total}", flush=True)


MAX_DIMENSION = 16384


def load_and_orient_image(image_path: str) -> Tuple[np.ndarray, Optional[np.ndarray]]:
    """
    Loads an image file, applies EXIF orientation, handles grayscale/16-bit/palette images,
    and returns (bgr_uint8, alpha_uint8_or_none).
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    # Open with PIL first to safely handle EXIF orientation and format diversity
    with Image.open(image_path) as pil_img:
        # 1. Apply EXIF orientation
        try:
            pil_img = ImageOps.exif_transpose(pil_img)
        except Exception as e:
            log(f"[PyTorch] Warning: Could not transpose EXIF on {os.path.basename(image_path)}: {e}")

        # Check mode and handle alpha / bit depths
        mode = pil_img.mode

        if mode == 'RGBA':
            arr = np.array(pil_img)
            rgb = arr[:, :, :3]
            alpha = arr[:, :, 3]
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            return bgr, alpha

        if mode == 'LA':
            # Grayscale with alpha
            pil_img_rgba = pil_img.convert('RGBA')
            arr = np.array(pil_img_rgba)
            rgb = arr[:, :, :3]
            alpha = arr[:, :, 3]
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            return bgr, alpha

        if mode == 'P':
            # Palette-based image
            if 'transparency' in pil_img.info:
                pil_img_rgba = pil_img.convert('RGBA')
                arr = np.array(pil_img_rgba)
                rgb = arr[:, :, :3]
                alpha = arr[:, :, 3]
                bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
                return bgr, alpha
            else:
                pil_img_rgb = pil_img.convert('RGB')
                arr = np.array(pil_img_rgb)
                bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
                return bgr, None

        if mode in ('I;16', 'I', 'F'):
            # 16-bit / 32-bit grayscale or float
            arr = np.array(pil_img, dtype=np.float32)
            min_val = arr.min()
            max_val = arr.max()
            if max_val > min_val:
                arr = ((arr - min_val) / (max_val - min_val) * 255.0).astype(np.uint8)
            else:
                arr = np.zeros(arr.shape, dtype=np.uint8)
            bgr = cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR)
            return bgr, None

        if mode in ('L', '1'):
            # 8-bit or 1-bit grayscale
            arr = np.array(pil_img.convert('L'), dtype=np.uint8)
            bgr = cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR)
            return bgr, None

        # Standard RGB or CMYK
        if mode != 'RGB':
            pil_img = pil_img.convert('RGB')
        arr = np.array(pil_img, dtype=np.uint8)
        bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        return bgr, None


def save_upscaled_image(
    bgr: np.ndarray,
    alpha: Optional[np.ndarray],
    output_path: str,
    output_format: str,
    quality: int = 95
) -> None:
    """
    Saves upscaled BGR and optional alpha channel according to the output format and quality.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    fmt = output_format.lower().replace('.', '')
    if fmt == 'jpeg':
        fmt = 'jpg'

    temp_path = f"{output_path}.tmp.{fmt}"
    try:
        if fmt == 'jpg':
            # JPEG cannot store alpha channel; blend alpha over white background if present
            if alpha is not None:
                alpha_f = alpha.astype(np.float32) / 255.0
                white = np.ones_like(bgr, dtype=np.float32) * 255.0
                blended = bgr.astype(np.float32) * alpha_f[:, :, None] + white * (1.0 - alpha_f[:, :, None])
                to_save = np.clip(blended, 0, 255).astype(np.uint8)
            else:
                to_save = bgr
            cv2.imwrite(temp_path, to_save, [cv2.IMWRITE_JPEG_QUALITY, int(quality)])

        elif fmt == 'webp':
            if alpha is not None:
                bgra = np.dstack([bgr, alpha])
                cv2.imwrite(temp_path, bgra, [cv2.IMWRITE_WEBP_QUALITY, int(quality)])
            else:
                cv2.imwrite(temp_path, bgr, [cv2.IMWRITE_WEBP_QUALITY, int(quality)])

        else:
            # Default to PNG
            if alpha is not None:
                bgra = np.dstack([bgr, alpha])
                cv2.imwrite(temp_path, bgra, [cv2.IMWRITE_PNG_COMPRESSION, 3])
            else:
                cv2.imwrite(temp_path, bgr, [cv2.IMWRITE_PNG_COMPRESSION, 3])

        if os.path.exists(temp_path):
            os.replace(temp_path, output_path)
    except Exception:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        raise


def upscale_single_image_pytorch(
    gpu_upscaler: GpuUpscaler,
    image_path: str,
    output_path: str,
    target_scale: int,
    output_format: str,
    quality: int,
    low_vram: bool = False,
    device: Optional[torch.device] = None
) -> str:
    """
    Upscales one image using the provided GpuUpscaler and saves it to output_path.
    """
    bgr, alpha = load_and_orient_image(image_path)
    h, w = bgr.shape[:2]
    out_h = int(round(h * target_scale))
    out_w = int(round(w * target_scale))

    # Guard against absurd outputs
    if out_h > MAX_DIMENSION or out_w > MAX_DIMENSION:
        raise ValueError(
            f"Output dimension ({out_w}x{out_h}) exceeds maximum supported size of {MAX_DIMENSION}px per side."
        )

    # Estimate output size and GPU memory pressure
    estimated_bytes = out_w * out_h * 4
    if device and device.type == 'cuda':
        try:
            free_mem, _ = torch.cuda.mem_get_info(device)
            if not low_vram and (estimated_bytes * 6 > free_mem or max(w, h) >= 1200):
                log(f"[PyTorch] Large image ({w}x{h} -> {out_w}x{out_h}, ~{estimated_bytes // (1024*1024)}MB). Auto-enabling tiling to protect VRAM.")
                gpu_upscaler.tile_size = 512
        except Exception:
            pass

    # Upscale RGB using Real-ESRGAN
    upscaled_bgr, _, _, _, _ = gpu_upscaler.upscale_frame_direct(bgr)

    # If alpha channel was present, upscale it with bicubic resize and recombine
    upscaled_alpha = None
    if alpha is not None:
        upscaled_alpha = cv2.resize(alpha, (out_w, out_h), interpolation=cv2.INTER_CUBIC)
        upscaled_alpha = np.clip(upscaled_alpha, 0, 255).astype(np.uint8)

    save_upscaled_image(
        bgr=upscaled_bgr,
        alpha=upscaled_alpha,
        output_path=output_path,
        output_format=output_format,
        quality=quality
    )

    return output_path


def parse_args():
    parser = argparse.ArgumentParser(description='TuxScale PyTorch Real-ESRGAN Image Upscaler')
    parser.add_argument('--inputs', nargs='*', default=[], help='List of input image paths')
    parser.add_argument('--input-list', default=None, help='Path to JSON file containing list of input image paths')
    parser.add_argument('--output-dir', default=None, help='Output directory')
    parser.add_argument('--outputs', nargs='*', default=[], help='Explicit list of output paths corresponding to inputs')
    parser.add_argument('--output-list', default=None, help='Path to JSON file containing list of output image paths')
    parser.add_argument('--model', default='realesr-animevideov3', help='Model name')
    parser.add_argument('--scale', type=int, default=4, help='Upscale scale factor (e.g. 2, 4)')
    parser.add_argument('--format', default='png', choices=['png', 'jpg', 'jpeg', 'webp'], help='Output format')
    parser.add_argument('--quality', type=int, default=95, help='Output quality for jpg/webp (1-100)')
    parser.add_argument('--tile', type=int, default=0, help='Tile size (0 = off/auto)')
    parser.add_argument('--low-vram', action='store_true', help='Enable low VRAM mode (tiling)')
    parser.add_argument('--fp32', action='store_true', help='Use FP32 instead of FP16')
    parser.add_argument('--weights-dir', default=None, help='Directory where model weights are stored')
    return parser.parse_args()


def run_image_upscaling():
    args = parse_args()

    input_paths: List[str] = []
    if args.input_list and os.path.exists(args.input_list):
        with open(args.input_list, 'r', encoding='utf-8') as f:
            input_paths = json.load(f)
    elif args.inputs:
        input_paths = args.inputs

    outputs: List[str] = []
    if args.output_list and os.path.exists(args.output_list):
        with open(args.output_list, 'r', encoding='utf-8') as f:
            outputs = json.load(f)
    elif args.outputs:
        outputs = args.outputs

    if not input_paths:
        log("ERROR: No input image paths provided.")
        sys.exit(1)

    if not torch.cuda.is_available():
        log("ERROR: CUDA is not available. PyTorch backend requires an NVIDIA GPU with CUDA.")
        sys.exit(1)

    if args.model not in MODEL_REGISTRY:
        log(f"ERROR: Unsupported model '{args.model}'. Available models: {list(MODEL_REGISTRY.keys())}")
        sys.exit(1)

    device = torch.device('cuda:0')
    weights_dir = args.weights_dir or get_default_weights_dir()
    model_path = download_weights(args.model, weights_dir, log_fn=log)

    tile_size = args.tile
    if args.low_vram and tile_size == 0:
        tile_size = 512

    half = not args.fp32
    log(f"[PyTorch] Loading Real-ESRGAN model '{args.model}' (scale={args.scale}x, tile={tile_size}, half={half})...")

    try:
        model = load_model(
            model_name=args.model,
            weights_path=model_path,
            device=device,
            half=half,
            channels_last=True
        )
    except Exception as e:
        log(f"ERROR: Failed to load model: {e}")
        sys.exit(1)

    gpu_upscaler = GpuUpscaler(
        model=model,
        device=device,
        target_scale=args.scale,
        net_scale=MODEL_REGISTRY[args.model]['netscale'],
        tile_size=tile_size,
        half=half,
        channels_last=True,
        log_fn=log
    )

    total_images = len(input_paths)
    log(f"[PyTorch] Processing {total_images} image(s)...")

    progress(0, total_images)

    def signal_handler(signum, frame):
        log(f"[PyTorch] Caught signal {signum}, stopping...")
        sys.exit(130 if signum == signal.SIGINT else 143)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    success_count = 0
    failure_count = 0

    for idx, in_path in enumerate(input_paths):
        # Determine output path
        if outputs and idx < len(outputs):
            out_path = outputs[idx]
        elif args.output_dir:
            base = os.path.splitext(os.path.basename(in_path))[0]
            fmt_ext = args.format.lower().replace('.', '')
            if fmt_ext == 'jpeg':
                fmt_ext = 'jpg'
            out_path = os.path.join(args.output_dir, f"{base}_upscaled.{fmt_ext}")
        else:
            base, _ = os.path.splitext(in_path)
            fmt_ext = args.format.lower().replace('.', '')
            if fmt_ext == 'jpeg':
                fmt_ext = 'jpg'
            out_path = f"{base}_upscaled.{fmt_ext}"

        try:
            log(f"[PyTorch] [{idx + 1}/{total_images}] Upscaling: {os.path.basename(in_path)}")
            upscale_single_image_pytorch(
                gpu_upscaler=gpu_upscaler,
                image_path=in_path,
                output_path=out_path,
                target_scale=args.scale,
                output_format=args.format,
                quality=args.quality,
                low_vram=args.low_vram,
                device=device
            )
            success_count += 1
            log(f"[PyTorch] [{idx + 1}/{total_images}] Complete -> {out_path}")
        except Exception as e:
            failure_count += 1
            log(f"[PyTorch] ERROR: Failed to upscale '{os.path.basename(in_path)}': {e}. Skipping.")

        # Print progress after each image
        progress(idx + 1, total_images)

    if failure_count > 0:
        log(f"[PyTorch] Finished with {failure_count} failure(s) out of {total_images} images.")
    else:
        log(f"[PyTorch] All {success_count} image(s) upscaled successfully.")


def main():
    try:
        run_image_upscaling()
    except KeyboardInterrupt:
        log("[PyTorch] Image upscaling cancelled by user.")
        sys.exit(130)


if __name__ == '__main__':
    main()
