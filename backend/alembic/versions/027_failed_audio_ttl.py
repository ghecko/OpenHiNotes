"""Failed-audio retention (Phase 6 follow-up).

When a transcription fails we now keep the audio file briefly so the
user can download it to debug. ``failed_audio_expires_at`` is the
timestamp after which the cleanup sweep removes the file. NULL on
non-failed rows.

Revision ID: 027_failed_audio_ttl
Revises: 026_per_user_pins
"""

import sqlalchemy as sa
from alembic import op

revision = "027_failed_audio_ttl"
down_revision = "026_per_user_pins"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transcriptions",
        sa.Column("failed_audio_expires_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_transcriptions_failed_audio_expires_at",
        "transcriptions",
        ["failed_audio_expires_at"],
        postgresql_where=sa.text("failed_audio_expires_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_transcriptions_failed_audio_expires_at",
        table_name="transcriptions",
    )
    op.drop_column("transcriptions", "failed_audio_expires_at")
