"""Add target_type column to summary_templates.

Revision ID: 019_template_target_type
Revises: 018_recording_type
"""

import sqlalchemy as sa
from alembic import op

revision = "019_template_target_type"
down_revision = "018_recording_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    target_type_enum = sa.Enum("record", "whisper", "both", name="templatetargettype")
    target_type_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "summary_templates",
        sa.Column(
            "target_type",
            sa.Enum("record", "whisper", "both", name="templatetargettype"),
            nullable=False,
            server_default="both",
        ),
    )


def downgrade() -> None:
    op.drop_column("summary_templates", "target_type")
    sa.Enum(name="templatetargettype").drop(op.get_bind(), checkfirst=True)
