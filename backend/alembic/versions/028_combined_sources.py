"""Combined-transcription source list (Phase 6 follow-up).

For transcriptions produced by merging several recordings, store the
ordered list of source recording filenames so the user can see which
audios were combined. NULL on normal single-source transcriptions.

Revision ID: 028_combined_sources
Revises: 027_failed_audio_ttl
"""

import sqlalchemy as sa
from alembic import op

revision = "028_combined_sources"
down_revision = "027_failed_audio_ttl"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transcriptions",
        sa.Column("combined_sources", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transcriptions", "combined_sources")
