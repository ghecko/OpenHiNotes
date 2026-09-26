"""Record the embedding model a voice profile was enrolled with.

The embedding space changed from pyannote/embedding (512-d) to the model the
pyannote speaker-diarization-community-1 pipeline clusters with (256-d):
profiles from the old space are not comparable and must be re-enrolled.
Existing rows are stamped with the old model so matching skips them.

Note: alembic_version.version_num is VARCHAR(32); keep revision ids <= 32 chars.

Revision ID: 031_voice_profile_model
Revises: 030_speaker_embeddings
"""
from alembic import op
import sqlalchemy as sa

revision = "031_voice_profile_model"
down_revision = "030_speaker_embeddings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "voice_profiles",
        sa.Column("embedding_model", sa.String(100), nullable=False, server_default="pyannote/embedding"),
    )


def downgrade() -> None:
    op.drop_column("voice_profiles", "embedding_model")
