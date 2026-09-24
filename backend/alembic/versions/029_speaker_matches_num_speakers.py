"""Add num_speakers hint and speaker_matches to transcriptions.

Revision ID: 029_speaker_matches_num_speakers
Revises: 028_combined_sources
"""
from alembic import op
import sqlalchemy as sa

revision = "029_speaker_matches_num_speakers"
down_revision = "028_combined_sources"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transcriptions", sa.Column("num_speakers", sa.Integer(), nullable=True))
    op.add_column("transcriptions", sa.Column("speaker_matches", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("transcriptions", "speaker_matches")
    op.drop_column("transcriptions", "num_speakers")
