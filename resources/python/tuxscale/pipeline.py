"""
Threaded streaming pipeline with bounded queues for TuxScale PyTorch backend.
Connects Reader -> GPU Worker -> Writer with double buffering and clean shutdown.
"""

import queue
import sys
import threading
import time
from typing import Optional, Callable

import numpy as np
import torch

from tuxscale.decode import cleanup_process
from tuxscale.dedupe import FrameDeduplicator
from tuxscale.gpu import GpuUpscaler
from tuxscale.timing import StageTimer


def run_pipeline(
    decoder,
    encoder,
    gpu_upscaler: GpuUpscaler,
    in_w: int,
    in_h: int,
    total_frames: int,
    deduplicator: FrameDeduplicator,
    stage_timer: StageTimer,
    queue_size: int = 3,
    progress_fn: Optional[Callable[[int, int], None]] = None,
    log_fn: Optional[Callable[[str], None]] = None
) -> int:
    """
    Run 3-stage threaded streaming pipeline:
      Stage 1: Reader thread (reads raw bgr24 from decoder pipe)
      Stage 2: GPU thread (dedupe check, transfers, model inference, post-process)
      Stage 3: Writer thread (writes raw bgr24 to encoder pipe)
    """
    def _log(msg: str):
        if log_fn:
            log_fn(msg)
        else:
            print(msg, file=sys.stderr, flush=True)

    def _progress(current: int, total: int):
        if progress_fn:
            progress_fn(current, total)
        else:
            print(f"PROGRESS {current} {total}", flush=True)

    frame_in_bytes = in_w * in_h * 3
    input_queue: queue.Queue = queue.Queue(maxsize=queue_size)
    output_queue: queue.Queue = queue.Queue(maxsize=queue_size)

    stop_event = threading.Event()
    pipeline_errors: list = []

    # Separate CUDA streams for overlapping host<->device copies with computation
    copy_stream = torch.cuda.Stream(device=gpu_upscaler.device)
    compute_stream = torch.cuda.Stream(device=gpu_upscaler.device)

    # ------------------ Reader Thread ------------------ #
    def reader_worker():
        frame_idx = 0
        try:
            while not stop_event.is_set():
                t0 = time.perf_counter()
                raw_bytes = decoder.stdout.read(frame_in_bytes)
                if not raw_bytes or len(raw_bytes) < frame_in_bytes:
                    break
                t_read_ms = (time.perf_counter() - t0) * 1000.0

                frame_np = np.frombuffer(raw_bytes, dtype=np.uint8).copy().reshape((in_h, in_w, 3))
                frame_idx += 1

                # Put into bounded queue (blocks if GPU stage is slower)
                while not stop_event.is_set():
                    try:
                        input_queue.put((frame_idx, frame_np, t_read_ms), timeout=0.1)
                        break
                    except queue.Full:
                        continue
        except Exception as e:
            if not stop_event.is_set():
                _log(f"[Pipeline] Reader error: {e}")
                pipeline_errors.append(e)
                stop_event.set()
        finally:
            # Signal EOF to GPU worker
            input_queue.put(None)

    # ------------------ GPU Worker Thread ------------------ #
    def gpu_worker():
        try:
            while not stop_event.is_set():
                item = None
                while not stop_event.is_set():
                    try:
                        item = input_queue.get(timeout=0.1)
                        break
                    except queue.Empty:
                        continue

                if item is None:
                    break

                frame_idx, frame_np, t_read_ms = item

                # Check duplicate frame
                if deduplicator.check_duplicate(frame_np):
                    out_bytes = deduplicator.prev_output
                    deduplicator.update(frame_np, out_bytes, was_duplicate=True)
                    # Instant duplicate reuse
                    item_out = (frame_idx, out_bytes, t_read_ms, 0.0, 0.0, 0.0, 0.0)
                else:
                    out_numpy, h2d_ms, model_ms, post_ms, d2h_ms = gpu_upscaler.upscale_frame_direct(
                        frame_np,
                        copy_stream=copy_stream,
                        compute_stream=compute_stream
                    )
                    out_bytes = out_numpy.tobytes()
                    deduplicator.update(frame_np, out_bytes, was_duplicate=False)
                    item_out = (frame_idx, out_bytes, t_read_ms, h2d_ms, model_ms, post_ms, d2h_ms)

                cur_total = max(total_frames, frame_idx)
                _progress(frame_idx, cur_total)

                # Send to Writer queue
                while not stop_event.is_set():
                    try:
                        output_queue.put(item_out, timeout=0.1)
                        break
                    except queue.Full:
                        continue
        except Exception as e:
            if not stop_event.is_set():
                _log(f"[Pipeline] GPU worker error: {e}")
                pipeline_errors.append(e)
                stop_event.set()
        finally:
            # Signal EOF to Writer
            output_queue.put(None)

    # ------------------ Writer Thread ------------------ #
    processed_count = [0]

    def writer_worker():
        try:
            while not stop_event.is_set():
                item = None
                while not stop_event.is_set():
                    try:
                        item = output_queue.get(timeout=0.1)
                        break
                    except queue.Empty:
                        continue

                if item is None:
                    break

                frame_idx, out_bytes, t_read_ms, h2d_ms, model_ms, post_ms, d2h_ms = item

                t0 = time.perf_counter()
                encoder.stdin.write(out_bytes)
                t_write_ms = (time.perf_counter() - t0) * 1000.0

                stage_timer.record_frame(
                    read_ms=t_read_ms,
                    h2d_ms=h2d_ms,
                    model_ms=model_ms,
                    post_ms=post_ms,
                    d2h_ms=d2h_ms,
                    write_ms=t_write_ms
                )
                processed_count[0] = frame_idx
        except Exception as e:
            if not stop_event.is_set():
                _log(f"[Pipeline] Writer error: {e}")
                pipeline_errors.append(e)
                stop_event.set()
        finally:
            try:
                if encoder.stdin:
                    encoder.stdin.close()
            except Exception:
                pass

    t_reader = threading.Thread(target=reader_worker, daemon=True)
    t_gpu = threading.Thread(target=gpu_worker, daemon=True)
    t_writer = threading.Thread(target=writer_worker, daemon=True)

    t_reader.start()
    t_gpu.start()
    t_writer.start()

    try:
        t_reader.join()
        t_gpu.join()
        t_writer.join()
    except KeyboardInterrupt:
        _log("[Pipeline] Interrupted by user.")
        stop_event.set()
    finally:
        stop_event.set()
        # Drain queues to avoid worker thread blockages
        while not input_queue.empty():
            try:
                input_queue.get_nowait()
            except Exception:
                break
        while not output_queue.empty():
            try:
                output_queue.get_nowait()
            except Exception:
                break

    if pipeline_errors:
        raise pipeline_errors[0]

    # Deduplication and timing summaries
    if deduplicator.enabled and deduplicator.total_frames > 0:
        skipped, total, pct = deduplicator.get_stats()
        _log(f"[Dedupe] Skipped duplicate frames: {skipped}/{total} ({pct:.1f}%)")

    stage_timer.summary()
    return processed_count[0]
