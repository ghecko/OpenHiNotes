"""Audio concatenation helper.

Used by the multi-recording combine flow: takes an ordered list of
input audio files (whatever container/codec each one happens to be)
and produces a single audio file. We re-encode through ffmpeg's
``concat`` filter so we don\'t care what format the inputs are in
— paying the CPU cost is worth it for the format-agnostic safety.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shlex
from pathlib import Path
from typing import Iterable

logger = logging.getLogger(__name__)


class AudioConcatError(RuntimeError):
    """Raised when ffmpeg cannot produce a combined output."""


async def concat_audio_files(
    input_paths: Iterable,
    output_path,
    *,
    sample_rate: int = 16000,
    channels: int = 1,
) -> Path:
    """Concatenate ``input_paths`` (in order) into ``output_path``.

    Inputs may be different formats / sample rates / channel counts;
    ffmpeg normalises everything before concatenating. The output is
    written as 16-bit signed PCM WAV at the supplied sample rate.

    Raises ``AudioConcatError`` when ffmpeg is missing or returns
    non-zero. Cleans up partial output on failure.
    """
    paths = [Path(p) for p in input_paths]
    if not paths:
        raise AudioConcatError("No input files provided")
    for p in paths:
        if not p.exists():
            raise AudioConcatError(f"Input file missing: {p}")

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    for p in paths:
        cmd.extend(["-i", str(p)])
    n = len(paths)
    if n == 1:
        cmd.extend([
            "-vn", "-ar", str(sample_rate), "-ac", str(channels),
            "-c:a", "pcm_s16le", str(out),
        ])
    else:
        streams = "".join(f"[{i}:a]" for i in range(n))
        filter_expr = f"{streams}concat=n={n}:v=0:a=1[out]"
        cmd.extend([
            "-filter_complex", filter_expr,
            "-map", "[out]",
            "-ar", str(sample_rate), "-ac", str(channels),
            "-c:a", "pcm_s16le", str(out),
        ])

    logger.info("Concatenating %d audio file(s) -> %s", n, out)
    logger.debug("ffmpeg: %s", " ".join(shlex.quote(c) for c in cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        if out.exists():
            try:
                os.remove(out)
            except OSError:
                pass
        err_text = stderr.decode("utf-8", errors="replace").strip()
        out_text = stdout.decode("utf-8", errors="replace").strip()
        detail = err_text or out_text or "no output"
        raise AudioConcatError(
            f"ffmpeg failed (rc={proc.returncode}): {detail}"
        )

    return out
