"""Add template_manager value to the userrole enum.

Introduces a scoped admin role that can review pending template submissions
and manage (edit/toggle/delete) any template, including built-in ones, but
has no other admin privileges.

Postgres requires ``ALTER TYPE ... ADD VALUE`` to run outside a transaction
block, hence ``autocommit_block``. Downgrade is intentionally a no-op:
Postgres has no safe way to drop a single enum value once it's been used
in any column.

Revision ID: 024_template_manager_role
Revises: 023_notifications
"""

from alembic import op

revision = "024_template_manager_role"
down_revision = "023_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'template_manager'"
        )


def downgrade() -> None:
    # Dropping a value from a Postgres enum is unsafe if any row uses it.
    # Leave the value in place on downgrade; the application simply stops
    # recognising it because the Python enum will be rolled back.
    pass
