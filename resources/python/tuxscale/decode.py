"""
FFmpeg video decoding and video probing for TuxScale.
"""

import json
import os
import subprocess
import sys
import threading
from typing import Dict, Any, Optional, Callable, Tuple


def get_video_info(input_path: str, ffmpeg_bin: str = 'ffmpeg') -> Dict[str, Any]:
    """Probe video dimensions, frame rate, and frame count via ffprobe."""
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
        print(f"ERROR: Failed to probe video with ffprobe: {e}", file=sys.stderr, flush=True)
        sys.exit(3)


def drain_pipe(pipe, name: str, lines_list: Optional[list] = None, log_fn: Optional[Callable[[str], None]] = None):
    """Continuously drain a process pipe in a background thread to prevent buffer deadlock."""
    def _drain():
        try:
            for raw_line in iter(pipe.readline, b''):
                line = raw_line.decode('utf-8', errors='replace').strip()
                if line:
                    if lines_list is not None:
                        lines_list.append(line)
                    if log_fn:
                        log_fn(f"[{name}] {line}")
        except Exception:
            pass
        finally:
            try:
                pipe.close()
            except Exception:
                pass

    t = threading.Thread(target=_drain, daemon=True)
    t.start()
    return t


def spawn_decoder(
    input_path: str,
    ffmpeg_bin: str = 'ffmpeg',
    log_fn: Optional[Callable[[str], None]] = None
) -> Tuple[subprocess.Popen, list]:
    """
    Spawn FFmpeg process to decode video stream to raw bgr24 frames.
    Returns (process, stderr_lines_list).
    """
    decode_cmd = [
        ffmpeg_bin,
        '-v', 'error',
        '-i', input_path,
        '-f', 'image2pipe',
        '-pix_fmt', 'bgr24',
        '-vcodec', 'rawvideo',
        'pipe:1'
    ]

    stderr_lines: list = []
    decoder = subprocess.Popen(
        decode_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=10**7
    )
    drain_pipe(decoder.stderr, 'FFmpeg-Decoder', stderr_lines, log_fn=None)
    return decoder, stderr_lines


def cleanup_process(proc: Optional[subprocess.Popen], timeout: float = 2.0) -> None:
    """Cleanly terminate child process to prevent orphaned ffmpeg processes."""
    if proc is None:
        return
    try:
        if proc.stdout:
            proc.stdout.close()
    except Exception:
        pass
    try:
        if proc.stdin:
            proc.stdin.close()
    except Exception:
        pass
    try:
        if proc.stderr:
            proc.stderr.close()
    except Exception:
        pass

    if proc.poll() is None:
        try:
            proc.terminate()
            proc.wait(timeout=timeout)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
