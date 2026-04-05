"""Add cancelled status and voxhub_job_id column

Revision ID: 010_cancel_and_voxhub_job_id
Revises: 009_keep_audio_setting
Create Date: 2026-04-05
"""
from alembic import op
import sqlalchemy as sa

revision = "010_cancel_and_voxhub_job_id"
down_revision = "009_keep_audio_setting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'cancelled' to the transcription status enum
    op.execute("ALTER TYPE transcriptionstatus ADD VALUE IF NOT EXISTS 'cancelled'")

    # Add voxhub_job_id column
    op.add_column("transcriptions", sa.Column("voxhub_job_id", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("transcriptions", "voxhub_job_id")
    # Note: PostgreSQL doesn't support removing enum values easily
