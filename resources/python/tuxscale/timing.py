"""
Timing instrumentation for TuxScale PyTorch streaming pipeline.
Logs average ms per frame spent in: read, host->GPU, model, post-process, GPU->host, write, plus overall fps.
"""

import sys
import time
from collections import deque
from typing import Callable, Optional


class StageTimer:
    """
    Tracks per-frame timings across the 6 pipeline stages:
      - read: fetching decoded frame from decoder
      - host->GPU: memory transfer from host RAM to GPU VRAM
      - model: neural network inference execution
      - post-process: tensor manipulation, resize, clamp, formatting
      - GPU->host: memory transfer from GPU VRAM to host RAM
      - write: writing encoded frame to encoder
    """

    def __init__(self, window_size: int = 50, log_fn: Optional[Callable[[str], None]] = None):
        self.window_size = window_size
        self.log_fn = log_fn or (lambda msg: print(msg, file=sys.stderr, flush=True))
        self.read_times = deque(maxlen=window_size)
        self.h2d_times = deque(maxlen=window_size)
        self.model_times = deque(maxlen=window_size)
        self.post_times = deque(maxlen=window_size)
        self.d2h_times = deque(maxlen=window_size)
        self.write_times = deque(maxlen=window_size)
        self.total_frames = 0
        self.start_time: Optional[float] = None
        self.window_start_time: Optional[float] = None

    def record_frame(
        self,
        read_ms: float,
        h2d_ms: float,
        model_ms: float,
        post_ms: float,
        d2h_ms: float,
        write_ms: float
    ) -> None:
        now = time.perf_counter()
        if self.start_time is None:
            self.start_time = now
            self.window_start_time = now

        self.read_times.append(read_ms)
        self.h2d_times.append(h2d_ms)
        self.model_times.append(model_ms)
        self.post_times.append(post_ms)
        self.d2h_times.append(d2h_ms)
        self.write_times.append(write_ms)
        self.total_frames += 1

        if self.total_frames % self.window_size == 0:
            self.log_window()

    def log_window(self) -> None:
        now = time.perf_counter()
        elapsed_window = now - self.window_start_time if self.window_start_time else 1.0
        window_fps = len(self.read_times) / max(elapsed_window, 1e-5)
        self.window_start_time = now

        avg_read = sum(self.read_times) / len(self.read_times)
        avg_h2d = sum(self.h2d_times) / len(self.h2d_times)
        avg_model = sum(self.model_times) / len(self.model_times)
        avg_post = sum(self.post_times) / len(self.post_times)
        avg_d2h = sum(self.d2h_times) / len(self.d2h_times)
        avg_write = sum(self.write_times) / len(self.write_times)

        start_frame = max(1, self.total_frames - len(self.read_times) + 1)
        msg = (
            f"[Timing] Frames {start_frame}-{self.total_frames}: "
            f"read: {avg_read:.1f}ms | host->GPU: {avg_h2d:.1f}ms | "
            f"model: {avg_model:.1f}ms | post-process: {avg_post:.1f}ms | "
            f"GPU->host: {avg_d2h:.1f}ms | write: {avg_write:.1f}ms | "
            f"fps: {window_fps:.2f}"
        )
        self.log_fn(msg)

    def summary(self) -> None:
        if self.total_frames == 0 or self.start_time is None:
            return
        total_time = time.perf_counter() - self.start_time
        overall_fps = self.total_frames / max(total_time, 1e-5)
        msg = (
            f"[Timing] Completed {self.total_frames} frames in {total_time:.2f}s "
            f"({overall_fps:.2f} fps overall)"
        )
        self.log_fn(msg)
