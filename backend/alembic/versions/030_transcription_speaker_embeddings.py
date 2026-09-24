"""Retained per-transcription speaker embeddings (admin-gated).

Revision ID: 030_transcription_speaker_embeddings
Revises: 029_speaker_matches_num_speakers
"""
from alembic import op
import sqlalchemy as sa

revision = "030_transcription_speaker_embeddings"
down_revision = "029_speaker_matches_num_speakers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transcription_speaker_embeddings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "transcription_id", sa.Uuid(),
            sa.ForeignKey("transcriptions.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("speaker_label", sa.String(100), nullable=False),
        sa.Column("encrypted_embedding", sa.LargeBinary(), nullable=False),
        sa.Column("encryption_nonce", sa.LargeBinary(12), nullable=False),
        sa.Column("encryption_tag", sa.LargeBinary(16), nullable=False),
        sa.Column("embedding_dim", sa.Integer(), nullable=False, server_default="512"),
        sa.Column("embedding_model", sa.String(100), nullable=False, server_default="pyannote/embedding"),
        sa.Column("speech_duration", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("transcription_id", "speaker_label", name="uq_tse_transcription_speaker"),
    )
    op.create_index(
        "ix_transcription_speaker_embeddings_transcription_id",
        "transcription_speaker_embeddings", ["transcription_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_transcription_speaker_embeddings_transcription_id", table_name="transcription_speaker_embeddings")
    op.drop_table("transcription_speaker_embeddings")
