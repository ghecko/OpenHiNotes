"""Transcript text as given to the LLM (summaries and chat)."""

from typing import Iterable, Optional


def _fmt_time(seconds: float) -> str:
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def select_segments(
    segments: Iterable[dict],
    speakers: Optional[Iterable[str]] = None,
    start: Optional[float] = None,
    end: Optional[float] = None,
) -> list:
    """Segments of the given speaker labels that overlap [start, end]."""
    wanted = set(speakers) if speakers is not None else None
    out = []
    for seg in segments or []:
        if wanted is not None and seg.get("speaker") not in wanted:
            continue
        seg_start = seg.get("start")
        seg_end = seg.get("end", seg_start)
        if start is not None and seg_end is not None and seg_end < start:
            continue
        if end is not None and seg_start is not None and seg_start > end:
            continue
        out.append(seg)
    return out


def build_annotated_text(
    transcription,
    speakers: Optional[Iterable[str]] = None,
    start: Optional[float] = None,
    end: Optional[float] = None,
    timestamps: bool = False,
) -> str:
    """Speaker-annotated transcript ("Alice: ...") when segments and speaker
    names are available, the plain text otherwise.

    ``speakers`` / ``start`` / ``end`` narrow the transcript to some turns
    (chat context selection). ``timestamps`` prefixes each speaker turn with
    its start time, useful when only a slice is given.
    """
    transcript_text = transcription.text or ""
    filtered = speakers is not None or start is not None or end is not None
    if transcription.segments and (transcription.speakers or filtered):
        speaker_map = transcription.speakers or {}
        annotated_parts = []
        prev_speaker = None
        for seg in select_segments(transcription.segments, speakers, start, end):
            speaker_id = seg.get("speaker")
            speaker_name = speaker_map.get(speaker_id, speaker_id) if speaker_id else None
            text = seg.get("text", "").strip()
            if not text:
                continue
            if speaker_name and speaker_name != prev_speaker:
                stamp = f"[{_fmt_time(seg.get('start') or 0)}] " if timestamps else ""
                annotated_parts.append(f"\n{stamp}{speaker_name}: {text}")
                prev_speaker = speaker_name
            else:
                annotated_parts.append(f" {text}")
        if annotated_parts:
            transcript_text = "".join(annotated_parts).strip()
        elif filtered:
            transcript_text = ""
    return transcript_text
