"""Add category column to summary_templates

Revision ID: 012_template_category
Revises: 011_default_tpl_sysprompt
Create Date: 2026-04-06
"""
from alembic import op
import sqlalchemy as sa

revision = "012_template_category"
down_revision = "011_default_tpl_sysprompt"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "summary_templates",
        sa.Column("category", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("summary_templates", "category")
