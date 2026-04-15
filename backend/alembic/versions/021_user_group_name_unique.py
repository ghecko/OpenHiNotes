"""Make user_groups.name globally unique.

Before applying the UNIQUE constraint, rename any existing duplicates
by appending " (2)", " (3)", ... so the migration succeeds on databases
that already have duplicates.

Revision ID: 021_user_group_name_unique
Revises: 020_user_group_owner_policy
"""

import sqlalchemy as sa
from alembic import op

revision = "021_user_group_name_unique"
down_revision = "020_user_group_owner_policy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename duplicates by created_at order: first one keeps the name,
    # subsequent ones get " (2)", " (3)", ... suffix
    op.execute("""
        WITH ranked AS (
            SELECT id, name,
                   ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at, id) AS rn
            FROM user_groups
        )
        UPDATE user_groups g
        SET name = g.name || ' (' || ranked.rn || ')'
        FROM ranked
        WHERE g.id = ranked.id AND ranked.rn > 1
    """)

    op.create_unique_constraint("uq_user_groups_name", "user_groups", ["name"])


def downgrade() -> None:
    op.drop_constraint("uq_user_groups_name", "user_groups", type_="unique")
