"""
FFmpeg video encoding and hardware encoder (NVENC) detection for TuxScale.
"""

import os
import subprocess
from typing import Dict, List, Optional, Tuple, Callable
from tuxscale.decode import drain_pipe


_NVENC_CACHE: Dict[str, bool] = {}


def detect_nvenc(ffmpeg_bin: str = 'ffmpeg', log_fn: Optional[Callable[[str], None]] = None) -> bool:
    """
    Check if NVIDIA NVENC is available by listing ffmpeg encoders and running a 1-frame test encode.
    Results are cached per ffmpeg_bin.
    """
    if ffmpeg_bin in _NVENC_CACHE:
        return _NVENC_CACHE[ffmpeg_bin]

    def _log(msg: str):
        if log_fn:
            log_fn(msg)

    # 1. Check if h264_nvenc is listed in ffmpeg -encoders
    try:
        res = subprocess.run(
            [ffmpeg_bin, '-encoders'],
            capture_output=True,
            text=True,
            timeout=10
        )
        if 'h264_nvenc' not in res.stdout:
            _NVENC_CACHE[ffmpeg_bin] = False
            return False
    except Exception as e:
        _log(f"[Encoder] Failed to query ffmpeg encoders: {e}")
        _NVENC_CACHE[ffmpeg_bin] = False
        return False

    # 2. Run a fast 1-frame test encode with h264_nvenc (minimum dimension is >= 144px)
    try:
        test_cmd = [
            ffmpeg_bin,
            '-v', 'error',
            '-f', 'lavfi',
            '-i', 'color=c=black:s=256x256:d=0.04',
            '-c:v', 'h264_nvenc',
            '-f', 'null',
            '-'
        ]
        test_res = subprocess.run(test_cmd, capture_output=True, text=True, timeout=10)
        if test_res.returncode == 0:
            _NVENC_CACHE[ffmpeg_bin] = True
            return True
        else:
            _log(f"[Encoder] NVENC test encode failed (code {test_res.returncode}): {test_res.stderr.strip()}")
            _NVENC_CACHE[ffmpeg_bin] = False
            return False
    except Exception as e:
        _log(f"[Encoder] NVENC test encode exception: {e}")
        _NVENC_CACHE[ffmpeg_bin] = False
        return False


def build_encoder_cmd(
    ffmpeg_bin: str,
    output_path: str,
    out_w: int,
    out_h: int,
    fps: float,
    encoder_choice: str = 'auto',
    log_fn: Optional[Callable[[str], None]] = None
) -> Tuple[List[str], str]:
    """
    Build ffmpeg encoding command and return (cmd_args, chosen_encoder_name).
    """
    def _log(msg: str):
        if log_fn:
            log_fn(msg)

    use_nvenc = False
    choice = encoder_choice.lower().strip()

    if choice == 'cpu':
        _log("[Encoder] Using CPU encoding (libx264) per setting")
        use_nvenc = False
    elif choice in ('auto', 'nvenc'):
        has_nvenc = detect_nvenc(ffmpeg_bin, log_fn=log_fn)
        if has_nvenc:
            use_nvenc = True
            _log("[Encoder] NVIDIA NVENC hardware acceleration detected and verified")
        else:
            if choice == 'nvenc':
                _log("[Encoder] WARNING: NVENC requested but unavailable/test failed; falling back to libx264")
            else:
                _log("[Encoder] NVENC is unavailable; falling back to CPU encoder (libx264)")
            use_nvenc = False
    else:
        _log(f"[Encoder] Unknown encoder choice '{choice}'; falling back to auto")
        use_nvenc = detect_nvenc(ffmpeg_bin, log_fn=log_fn)

    cmd = [
        ffmpeg_bin,
        '-v', 'error',
        '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-s', f"{out_w}x{out_h}",
        '-pix_fmt', 'bgr24',
        '-r', str(fps),
        '-i', 'pipe:0'
    ]

    chosen_codec = 'libx264'
    if use_nvenc:
        # If output <= 4096 px in both dimensions use h264_nvenc, otherwise hevc_nvenc
        if out_w <= 4096 and out_h <= 4096:
            chosen_codec = 'h264_nvenc'
            cmd.extend([
                '-c:v', 'h264_nvenc',
                '-preset', 'p5',
                '-tune', 'hq',
                '-rc', 'vbr',
                '-cq', '19',
                '-b:v', '0',
                '-pix_fmt', 'yuv420p',
                '-an',
                output_path
            ])
        else:
            chosen_codec = 'hevc_nvenc'
            cmd.extend([
                '-c:v', 'hevc_nvenc',
                '-tag:v', 'hvc1',
                '-preset', 'p5',
                '-tune', 'hq',
                '-rc', 'vbr',
                '-cq', '19',
                '-b:v', '0',
                '-pix_fmt', 'yuv420p',
                '-an',
                output_path
            ])
    else:
        chosen_codec = 'libx264'
        cmd.extend([
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-crf', '18',
            '-preset', 'veryfast',
            '-an',
            output_path
        ])

    return cmd, chosen_codec


def spawn_encoder(
    cmd: List[str],
    log_fn: Optional[Callable[[str], None]] = None
) -> Tuple[subprocess.Popen, list]:
    """
    Spawn FFmpeg encoder process with background stderr drain thread.
    Returns (process, stderr_lines_list).
    """
    stderr_lines: list = []
    encoder = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=10**7
    )
    drain_pipe(encoder.stderr, 'FFmpeg-Encoder', stderr_lines, log_fn=None)
    return encoder, stderr_lines
