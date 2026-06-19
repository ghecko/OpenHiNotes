"""create app_settings table

Revision ID: 006b_app_settings
Revises: 006_access_control
Create Date: 2026-04-15

This migration was missing from the original chain. Multiple subsequent migrations
(007, 009, 011) INSERT into app_settings without this table ever being created.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006b_app_settings"
down_revision: Union[str, None] = "006_access_control"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(255), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False, server_default=""),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
