"""Phase 6 — full-text search, pinning, and notification prefs.

This migration bundles three small schema changes for Phase 6 features:

* ``transcriptions.is_pinned`` (6.2 — Favorites / pinning)
* GIN expression index on ``to_tsvector(title || ' ' || text)`` for the
  transcriptions table (6.1 — Full-text search). Using an expression index
  instead of a stored tsvector column keeps the model simple and avoids
  trigger maintenance; ``simple`` is used as the dictionary to behave the
  same way regardless of the user's locale.
* ``users.notify_on_completion`` and ``users.notify_email_on_completion``
  (6.5 — Notifications on transcription complete).

Revision ID: 025_phase6_search_pin_prefs
Revises: 024_template_manager_role
"""

import sqlalchemy as sa
from alembic import op

revision = "025_phase6_search_pin_prefs"
down_revision = "024_template_manager_role"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- 6.2: pinning ---------------------------------------------------
    op.add_column(
        "transcriptions",
        sa.Column(
            "is_pinned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # Partial index — most rows are unpinned, so this stays tiny and is
    # used to short-circuit the "show pinned first" ordering.
    op.create_index(
        "ix_transcriptions_is_pinned",
        "transcriptions",
        ["is_pinned"],
        postgresql_where=sa.text("is_pinned"),
    )

    # --- 6.1: full-text search index -----------------------------------
    # GIN expression index on title + text. Uses ``simple`` so search
    # works across English/French/etc. without needing per-row language
    # detection. ``coalesce`` guards against NULLs.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_transcriptions_fts
        ON transcriptions
        USING GIN (
            to_tsvector(
                'simple',
                coalesce(title, '') || ' ' || coalesce(text, '')
            )
        )
        """
    )

    # --- 6.5: per-user notification preferences ------------------------
    op.add_column(
        "users",
        sa.Column(
            "notify_on_completion",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "notify_email_on_completion",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "notify_email_on_completion")
    op.drop_column("users", "notify_on_completion")
    op.execute("DROP INDEX IF EXISTS ix_transcriptions_fts")
    op.drop_index("ix_transcriptions_is_pinned", table_name="transcriptions")
    op.drop_column("transcriptions", "is_pinned")
