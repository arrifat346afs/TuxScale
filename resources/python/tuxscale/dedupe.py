"""
Frame deduplication for TuxScale PyTorch pipeline.
Detects identical or near-identical consecutive frames to bypass model inference.
"""

from typing import Optional, Tuple
import numpy as np


class FrameDeduplicator:
    """
    Compares input frames to previous input frame using downscaled subsampling.
    When a duplicate is detected, reuses the previous upscaled output, preserving
    exact output frame count and timestamps while saving GPU cycles.
    """

    def __init__(self, enabled: bool = True, threshold: float = 0.5):
        self.enabled = enabled
        self.threshold = threshold
        self.prev_input_sub: Optional[np.ndarray] = None
        self.prev_output: Optional[bytes] = None
        self.total_frames = 0
        self.skipped_frames = 0

    def check_duplicate(self, input_frame: np.ndarray) -> bool:
        """
        Check if input_frame is a duplicate of previous frame.
        input_frame is HxWx3 uint8 numpy array.
        """
        if not self.enabled or self.prev_output is None:
            return False

        # Fast subsampling down to ~64-128px grid
        # E.g. slicing with step 16 is instantaneous (zero copy view)
        sub = input_frame[::16, ::16, :]

        if self.prev_input_sub is None:
            return False

        if sub.shape != self.prev_input_sub.shape:
            return False

        # Exact match check first
        if np.array_equal(sub, self.prev_input_sub):
            return True

        # Tiny threshold check (mean absolute difference per pixel/channel)
        if self.threshold > 0:
            diff = np.mean(np.abs(sub.astype(np.int16) - self.prev_input_sub.astype(np.int16)))
            if diff <= self.threshold:
                return True

        return False

    def update(self, input_frame: np.ndarray, output_bytes: bytes, was_duplicate: bool) -> None:
        self.total_frames += 1
        if was_duplicate:
            self.skipped_frames += 1
        else:
            self.prev_input_sub = input_frame[::16, ::16, :].copy()
            self.prev_output = output_bytes

    def get_stats(self) -> Tuple[int, int, float]:
        """Returns (skipped_frames, total_frames, skipped_percentage)."""
        pct = (self.skipped_frames / max(1, self.total_frames)) * 100.0
        return self.skipped_frames, self.total_frames, pct
