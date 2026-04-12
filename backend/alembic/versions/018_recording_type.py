"""Add recording_type column to transcriptions.

Revision ID: 018_recording_type
Revises: 017_recording_aliases
"""

import sqlalchemy as sa
from alembic import op

revision = "018_recording_type"
down_revision = "017_recording_aliases"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the enum type first
    recording_type_enum = sa.Enum("record", "whisper", name="recordingtype")
    recording_type_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "transcriptions",
        sa.Column(
            "recording_type",
            sa.Enum("record", "whisper", name="recordingtype"),
            nullable=False,
            server_default="record",
        ),
    )


def downgrade() -> None:
    op.drop_column("transcriptions", "recording_type")
    sa.Enum(name="recordingtype").drop(op.get_bind(), checkfirst=True)
