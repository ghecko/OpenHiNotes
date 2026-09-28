"""Transcript text as given to the LLM (summaries and chat)."""


def build_annotated_text(transcription) -> str:
    """Speaker-annotated transcript ("Alice: ...") when segments and speaker
    names are available, the plain text otherwise."""
    transcript_text = transcription.text or ""
    if transcription.segments and transcription.speakers:
        speaker_map = transcription.speakers or {}
        annotated_parts = []
        prev_speaker = None
        for seg in transcription.segments:
            speaker_id = seg.get("speaker")
            speaker_name = speaker_map.get(speaker_id, speaker_id) if speaker_id else None
            text = seg.get("text", "").strip()
            if not text:
                continue
            if speaker_name and speaker_name != prev_speaker:
                annotated_parts.append(f"\n{speaker_name}: {text}")
                prev_speaker = speaker_name
            else:
                annotated_parts.append(f" {text}")
        if annotated_parts:
            transcript_text = "".join(annotated_parts).strip()
    return transcript_text
