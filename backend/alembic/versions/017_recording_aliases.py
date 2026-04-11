"""Add recording_aliases JSON column to users table.

Revision ID: 017
Revises: 016
"""
from alembic import op
import sqlalchemy as sa

revision = "017_recording_aliases"
down_revision = "016_oidc_support"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("recording_aliases", sa.JSON(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("users", "recording_aliases")
