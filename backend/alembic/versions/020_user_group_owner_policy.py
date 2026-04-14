"""Add owner_id and sharing_policy to user_groups.

Revision ID: 020_user_group_owner_policy
Revises: 019_template_target_type
"""

import sqlalchemy as sa
from alembic import op

revision = "020_user_group_owner_policy"
down_revision = "019_template_target_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the SharingPolicy enum type
    sharing_policy_enum = sa.Enum("creator_only", "members_allowed", name="sharingpolicy")
    sharing_policy_enum.create(op.get_bind(), checkfirst=True)

    # Add owner_id — nullable first so we can backfill from created_by
    op.add_column(
        "user_groups",
        sa.Column("owner_id", sa.UUID(), nullable=True),
    )

    # Backfill owner_id from created_by for all existing groups
    op.execute("UPDATE user_groups SET owner_id = created_by WHERE owner_id IS NULL")

    # Now make it non-nullable and add FK + index
    op.alter_column("user_groups", "owner_id", nullable=False)
    op.create_foreign_key(
        "fk_user_groups_owner_id",
        "user_groups", "users",
        ["owner_id"], ["id"],
    )
    op.create_index("ix_user_groups_owner_id", "user_groups", ["owner_id"])

    # Add sharing_policy column
    op.add_column(
        "user_groups",
        sa.Column(
            "sharing_policy",
            sa.Enum("creator_only", "members_allowed", name="sharingpolicy"),
            nullable=False,
            server_default="creator_only",
        ),
    )


def downgrade() -> None:
    op.drop_index("ix_user_groups_owner_id", table_name="user_groups")
    op.drop_constraint("fk_user_groups_owner_id", "user_groups", type_="foreignkey")
    op.drop_column("user_groups", "sharing_policy")
    op.drop_column("user_groups", "owner_id")
    sa.Enum(name="sharingpolicy").drop(op.get_bind(), checkfirst=True)
