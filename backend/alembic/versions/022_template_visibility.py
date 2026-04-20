"""Add visibility + review fields to summary_templates.

Adds visibility enum (private/pending_review/public), plus reviewed_by,
reviewed_at, and review_feedback columns to support user-created templates
and admin review flow (Sprint 6 — roadmap 4.1 + 4.2).

All existing templates are backfilled to `public` because they were
admin-created under the previous model.

Revision ID: 022_template_visibility
Revises: 021_user_group_name_unique
"""

import sqlalchemy as sa
from alembic import op

revision = "022_template_visibility"
down_revision = "021_user_group_name_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the TemplateVisibility enum type
    visibility_enum = sa.Enum(
        "private", "pending_review", "public", name="templatevisibility"
    )
    visibility_enum.create(op.get_bind(), checkfirst=True)

    # Add visibility column — existing rows default to 'public' (they were all
    # admin-created under the previous model).
    op.add_column(
        "summary_templates",
        sa.Column(
            "visibility",
            sa.Enum("private", "pending_review", "public", name="templatevisibility"),
            nullable=False,
            server_default="public",
        ),
    )

    # Review metadata — all nullable, only populated during/after review.
    op.add_column(
        "summary_templates",
        sa.Column("reviewed_by", sa.UUID(), nullable=True),
    )
    op.add_column(
        "summary_templates",
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "summary_templates",
        sa.Column("review_feedback", sa.Text(), nullable=True),
    )

    op.create_foreign_key(
        "fk_summary_templates_reviewed_by",
        "summary_templates", "users",
        ["reviewed_by"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_summary_templates_visibility",
        "summary_templates",
        ["visibility"],
    )
    op.create_index(
        "ix_summary_templates_created_by",
        "summary_templates",
        ["created_by"],
    )


def downgrade() -> None:
    op.drop_index("ix_summary_templates_created_by", table_name="summary_templates")
    op.drop_index("ix_summary_templates_visibility", table_name="summary_templates")
    op.drop_constraint(
        "fk_summary_templates_reviewed_by", "summary_templates", type_="foreignkey"
    )
    op.drop_column("summary_templates", "review_feedback")
    op.drop_column("summary_templates", "reviewed_at")
    op.drop_column("summary_templates", "reviewed_by")
    op.drop_column("summary_templates", "visibility")
    sa.Enum(name="templatevisibility").drop(op.get_bind(), checkfirst=True)
