"""Phase 6 follow-up — per-user transcription pins.

The first cut of pinning (migration 025) stored ``is_pinned`` on the
``transcriptions`` row, which meant the pin was visible to every user
that the transcription was shared with. That's the wrong model — pinning
is a personal bookmark.

This migration:

1. creates a ``transcription_pins`` join table (user_id, transcription_id)
2. backfills existing pins: for every row where ``is_pinned`` was true,
   the owner of the transcription gets a pin row, preserving their UX
3. drops the now-unused ``is_pinned`` column and its partial index

Revision ID: 026_per_user_pins
Revises: 025_phase6_search_pin_prefs
"""

import sqlalchemy as sa
from alembic import op

revision = "026_per_user_pins"
down_revision = "025_phase6_search_pin_prefs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transcription_pins",
        sa.Column(
            "user_id",
            sa.UUID(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "transcription_id",
            sa.UUID(),
            sa.ForeignKey("transcriptions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index(
        "ix_transcription_pins_transcription_id",
        "transcription_pins",
        ["transcription_id"],
    )

    # Backfill: every currently-pinned transcription becomes a pin for
    # its owner. Anyone the transcription was shared with loses the pin,
    # which matches the new "personal bookmark" semantics.
    op.execute(
        """
        INSERT INTO transcription_pins (user_id, transcription_id)
        SELECT user_id, id FROM transcriptions WHERE is_pinned = true
        ON CONFLICT DO NOTHING
        """
    )

    op.execute("DROP INDEX IF EXISTS ix_transcriptions_is_pinned")
    op.drop_column("transcriptions", "is_pinned")


def downgrade() -> None:
    op.add_column(
        "transcriptions",
        sa.Column(
            "is_pinned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        "ix_transcriptions_is_pinned",
        "transcriptions",
        ["is_pinned"],
        postgresql_where=sa.text("is_pinned"),
    )
    # Best-effort restoration of the old flag: mark any transcription
    # with at least one pin as pinned. The previous owner-only semantics
    # mean the result isn't perfect, but it's better than losing pins.
    op.execute(
        """
        UPDATE transcriptions SET is_pinned = true
        WHERE id IN (SELECT DISTINCT transcription_id FROM transcription_pins)
        """
    )

    op.drop_index(
        "ix_transcription_pins_transcription_id",
        table_name="transcription_pins",
    )
    op.drop_table("transcription_pins")
