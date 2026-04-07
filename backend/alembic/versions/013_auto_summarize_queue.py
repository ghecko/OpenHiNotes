"""Add auto_summarize columns to transcriptions

Revision ID: 013_auto_summarize_queue
Revises: 012_template_category
Create Date: 2026-04-07
"""
from alembic import op
import sqlalchemy as sa

revision = "013_auto_summarize_queue"
down_revision = "012_template_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transcriptions",
        sa.Column("auto_summarize", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "transcriptions",
        sa.Column(
            "auto_summarize_template_id",
            sa.Uuid(),
            sa.ForeignKey("summary_templates.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("transcriptions", "auto_summarize_template_id")
    op.drop_column("transcriptions", "auto_summarize")
