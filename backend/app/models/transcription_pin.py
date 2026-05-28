"""Per-user transcription pin (Phase 6 follow-up).

A user can pin any transcription they can read. Pins are personal —
they do NOT propagate to other users who can see the same transcription.

Modelled as a Core ``Table`` rather than an ORM class because there is
no row-level data beyond the composite PK + a timestamp.
"""

from sqlalchemy import Column, DateTime, ForeignKey, Index, Table
from datetime import datetime

from app.database import Base


transcription_pins = Table(
    "transcription_pins",
    Base.metadata,
    Column(
        "user_id",
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "transcription_id",
        ForeignKey("transcriptions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "created_at",
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    ),
    Index(
        "ix_transcription_pins_transcription_id",
        "transcription_id",
    ),
)
