"""
Diagnose voice-profile matching with the embeddings already in the database.

Prints, for every active voice profile, the cosine distance to every stored
per-speaker transcription embedding (retention must have been on when the
transcriptions ran), then the full pairwise matrix between those stored
embeddings. Rows are labelled with the transcription title, the diarization
label, the human name from ``speakers`` and the match status, so you can read
off the two numbers that decide SPEAKER_MATCH_THRESHOLD:

  * same voice across recordings  → should be clearly below the threshold
  * different voices              → should be clearly above it

Run inside the backend container (the DB URL and the embedding key come from
its environment):

    docker compose -f docker-compose.prod.yml cp backend/scripts/voice_distances.py backend:/app/voice_distances.py
    docker compose -f docker-compose.prod.yml exec backend python /app/voice_distances.py

Read-only: nothing is written.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

sys.path.insert(0, "/app")

from sqlalchemy import select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.transcription import Transcription  # noqa: E402
from app.models.transcription_speaker_embedding import TranscriptionSpeakerEmbedding  # noqa: E402
from app.services.speaker_identification import (  # noqa: E402
    cosine_distance,
    decrypt_embedding,
    load_all_active_embeddings,
)


def _short(s: str | None, n: int) -> str:
    s = (s or "").strip()
    return (s[: n - 1] + "…") if len(s) > n else s.ljust(n)


async def main(args) -> int:
    async with AsyncSessionLocal() as db:
        profiles = await load_all_active_embeddings(db)
        rows = (
            await db.execute(
                select(TranscriptionSpeakerEmbedding, Transcription)
                .join(Transcription, Transcription.id == TranscriptionSpeakerEmbedding.transcription_id)
                .order_by(Transcription.created_at, TranscriptionSpeakerEmbedding.speaker_label)
            )
        ).all()

    clusters = []  # (name, embedding)
    for emb_row, t in rows:
        try:
            vec = decrypt_embedding(emb_row.encrypted_embedding, emb_row.encryption_nonce, emb_row.encryption_tag)
        except Exception as e:  # noqa: BLE001
            print(f"  ! cannot decrypt {t.id}/{emb_row.speaker_label}: {e}")
            continue
        human = (t.speakers or {}).get(emb_row.speaker_label) or ""
        match = (t.speaker_matches or {}).get(emb_row.speaker_label) or {}
        status = match.get("status", "")
        who = human if human and human != emb_row.speaker_label else match.get("display_name", "")
        name = f"{_short(t.title or str(t.id)[:8], 22)} {emb_row.speaker_label:10} {_short(who, 10)} {status:9}"
        clusters.append((name, vec))

    if not profiles:
        print("No active voice profile.")
    if not clusters:
        print("No stored transcription embeddings (enable speaker_embedding_retention_enabled, "
              "then transcribe; only transcriptions run after that are stored).")
        return 0

    print(f"{len(profiles)} profile(s), {len(clusters)} stored cluster embedding(s)\n")
    for pid, uid, display, label, pvec in profiles:
        print(f"== profile {display!r} ({label}, {str(pid)[:8]}): distance to every stored cluster")
        for name, vec in sorted(clusters, key=lambda c: cosine_distance(pvec, c[1])):
            print(f"   {cosine_distance(pvec, vec):.3f}  {name}")
        print()

    print("== pairwise distances between stored clusters (lower-left triangle)")
    width = 6
    header = " " * 60 + "".join(f"{i:>{width}}" for i in range(len(clusters)))
    print(header)
    for i, (name_i, vec_i) in enumerate(clusters):
        cells = "".join(f"{cosine_distance(vec_i, clusters[j][1]):>{width}.3f}" for j in range(i))
        print(f"{i:>3} {name_i[:55]:55} {cells}")
    print("\nRead: rows that share a person's name should sit at low values with each other and high "
          "values with everyone else; the threshold goes in the gap.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sys.exit(asyncio.run(main(ap.parse_args())))
