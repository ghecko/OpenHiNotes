"""Vocabulary (glossary) terms: general per user, or attached to a collection.

Fed to the LLM for summaries and chat so it can restore the right spelling
of terms the speech recognizer mangles, and ready to be sent to VoxHub as
context_bias once a transcription backend supports it.

Note: alembic_version.version_num is VARCHAR(32); keep revision ids <= 32 chars.

Revision ID: 033_glossary_terms
Revises: 032_summary_jobs
"""
from alembic import op
import sqlalchemy as sa

revision = "033_glossary_terms"
down_revision = "032_summary_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "glossary_terms",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("collection_id", sa.Uuid(), sa.ForeignKey("collections.id", ondelete="CASCADE"), nullable=True),
        sa.Column("term", sa.String(255), nullable=False),
        sa.Column("aliases", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_glossary_terms_user_id", "glossary_terms", ["user_id"])
    op.create_index("ix_glossary_terms_collection_id", "glossary_terms", ["collection_id"])


def downgrade() -> None:
    op.drop_index("ix_glossary_terms_collection_id", table_name="glossary_terms")
    op.drop_index("ix_glossary_terms_user_id", table_name="glossary_terms")
    op.drop_table("glossary_terms")
