"""
Command-line interface and execution orchestrator for TuxScale PyTorch streaming pipeline.
"""

import argparse
import os
import signal
import sys
from typing import Optional

import torch

from tuxscale.decode import get_video_info, spawn_decoder, cleanup_process
from tuxscale.dedupe import FrameDeduplicator
from tuxscale.encode import build_encoder_cmd, spawn_encoder
from tuxscale.gpu import (
    MODEL_REGISTRY,
    get_default_weights_dir,
    download_weights,
    load_model,
    GpuUpscaler
)
from tuxscale.pipeline import run_pipeline
from tuxscale.timing import StageTimer


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def progress(current: int, total: int) -> None:
    print(f"PROGRESS {current} {total}", flush=True)


def parse_args():
    parser = argparse.ArgumentParser(description='TuxScale PyTorch Real-ESRGAN Streaming Video Upscaler')
    parser.add_argument('--input', required=True, help='Path to input video')
    parser.add_argument('--output', required=True, help='Path to output video (.mp4)')
    parser.add_argument('--model', default='realesr-animevideov3', help='Model name')
    parser.add_argument('--scale', type=int, default=4, help='Upscale factor (e.g. 2, 4)')
    parser.add_argument('--tile', type=int, default=0, help='Tile size (0 = off/full frame)')
    parser.add_argument('--low-vram', action='store_true', help='Enable low VRAM mode (tiling)')
    parser.add_argument('--fp32', action='store_true', help='Use FP32 instead of FP16')
    parser.add_argument('--encoder', default='auto', choices=['auto', 'nvenc', 'cpu'], help='Encoder mode')
    parser.add_argument('--skip-duplicates', dest='skip_duplicates', action='store_true', default=True, help='Skip duplicate frames')
    parser.add_argument('--no-skip-duplicates', dest='skip_duplicates', action='store_false', help='Do not skip duplicate frames')
    parser.add_argument('--ffmpeg-bin', default='ffmpeg', help='Path to ffmpeg binary')
    parser.add_argument('--weights-dir', default=None, help='Directory where model weights are stored')
    return parser.parse_args()


def main():
    if '--images' in sys.argv:
        # Remove --images and dispatch to images upscaler
        sys.argv.remove('--images')
        from tuxscale.images import main as images_main
        images_main()
        return

    args = parse_args()

    if not os.path.exists(args.input):
        log(f"ERROR: Input video not found: {args.input}")
        sys.exit(1)

    if not torch.cuda.is_available():
        log("ERROR: CUDA is not available. PyTorch backend requires an NVIDIA GPU with CUDA.")
        sys.exit(1)

    device = torch.device('cuda:0')
    weights_dir = args.weights_dir or get_default_weights_dir()
    model_path = download_weights(args.model, weights_dir, log_fn=log)

    # Probe input video
    vinfo = get_video_info(args.input, args.ffmpeg_bin)
    in_w = vinfo['width']
    in_h = vinfo['height']
    fps = vinfo['fps']
    total_frames = vinfo['total_frames']

    out_w = in_w * args.scale
    out_h = in_h * args.scale

    log(f"Input: {args.input} ({in_w}x{in_h} @ {fps:.2f}fps, ~{total_frames} frames)")
    log(f"Target scale: {args.scale}x -> {out_w}x{out_h}")

    # Low VRAM mode tile configuration
    tile_size = args.tile
    if args.low_vram and tile_size == 0:
        tile_size = 512

    half = (not args.fp32)
    log(f"Loading PyTorch model '{args.model}' (tile={tile_size}, half={half}, channels_last=True)...")

    try:
        model, net_scale, half = load_model(
            model_name=args.model,
            weights_path=model_path,
            device=device,
            half=half,
            channels_last=True,
            log_fn=log
        )
    except Exception as e:
        log(f"ERROR: could not load {args.model}: {e}")
        sys.exit(1)

    arch_id = getattr(getattr(model, 'architecture', None), 'id', '')
    reg_info = MODEL_REGISTRY.get(args.model)
    if (reg_info and reg_info.get('kind') == 'image-only') or 'DAT' in arch_id or 'Transformer' in arch_id:
        log(f"WARNING: Model '{args.model}' is a transformer/DAT architecture (Image only - slow). Video processing may be very slow.")

    gpu_upscaler = GpuUpscaler(
        model=model,
        device=device,
        target_scale=args.scale,
        net_scale=net_scale,
        tile_size=tile_size,
        half=half,
        channels_last=True,
        log_fn=log
    )

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    # Build encoder command
    enc_cmd, chosen_encoder = build_encoder_cmd(
        ffmpeg_bin=args.ffmpeg_bin,
        output_path=args.output,
        out_w=out_w,
        out_h=out_h,
        fps=fps,
        encoder_choice=args.encoder,
        log_fn=log
    )

    log(f"Pipeline: ffmpeg decode -> GPU direct ({chosen_encoder}) -> output")

    # Spawn processes
    decoder, dec_stderr = spawn_decoder(args.input, args.ffmpeg_bin, log_fn=log)
    encoder, enc_stderr = spawn_encoder(enc_cmd, log_fn=log)

    active_processes = [decoder, encoder]

    def signal_handler(signum, frame):
        log(f"[TuxScale] Caught signal {signum}, stopping processes cleanly...")
        for p in active_processes:
            cleanup_process(p)
        sys.exit(130 if signum == signal.SIGINT else 143)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    deduplicator = FrameDeduplicator(enabled=args.skip_duplicates)
    stage_timer = StageTimer(window_size=50, log_fn=log)

    processed_frames = 0
    try:
        processed_frames = run_pipeline(
            decoder=decoder,
            encoder=encoder,
            gpu_upscaler=gpu_upscaler,
            in_w=in_w,
            in_h=in_h,
            total_frames=total_frames,
            deduplicator=deduplicator,
            stage_timer=stage_timer,
            queue_size=3,
            progress_fn=progress,
            log_fn=log
        )

        dec_code = decoder.wait()
        enc_code = encoder.wait()

        if dec_code != 0:
            err_msg = "\n".join(dec_stderr[-10:]) if dec_stderr else f"exit code {dec_code}"
            log(f"ERROR: Decoder failed: {err_msg}")
            sys.exit(dec_code)

        if enc_code != 0:
            err_msg = "\n".join(enc_stderr[-10:]) if enc_stderr else f"exit code {enc_code}"
            log(f"ERROR: Encoder failed: {err_msg}")
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
        for p in active_processes:
            cleanup_process(p)


if __name__ == '__main__':
    main()
