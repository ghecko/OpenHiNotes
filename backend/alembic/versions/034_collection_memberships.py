"""A transcription can be in several collections: collection_transcriptions.

Replaces transcriptions.collection_id. Each membership records who added
it; sharing a collection only grants access to the transcriptions their
owner added (a write-sharee could otherwise re-share a transcription by
moving it into a collection of their own and sharing that).

Existing links are copied as added by the transcription owner, which keeps
today's access unchanged.

Note: alembic_version.version_num is VARCHAR(32); keep revision ids <= 32 chars.

Revision ID: 034_collection_memberships
Revises: 033_glossary_terms
"""
from alembic import op
import sqlalchemy as sa

revision = "034_collection_memberships"
down_revision = "033_glossary_terms"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "collection_transcriptions",
        sa.Column("collection_id", sa.Uuid(), sa.ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("transcription_id", sa.Uuid(), sa.ForeignKey("transcriptions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("added_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_collection_transcriptions_transcription_id", "collection_transcriptions", ["transcription_id"]
    )
    op.execute(
        """
        INSERT INTO collection_transcriptions (collection_id, transcription_id, added_by_id, created_at)
        SELECT collection_id, id, user_id, COALESCE(updated_at, created_at)
        FROM transcriptions
        WHERE collection_id IS NOT NULL
        """
    )
    # Also drops its index and foreign key (named by migration 004's defaults).
    op.drop_column("transcriptions", "collection_id")


def downgrade() -> None:
    op.add_column("transcriptions", sa.Column("collection_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "transcriptions_collection_id_fkey", "transcriptions", "collections",
        ["collection_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_transcriptions_collection_id", "transcriptions", ["collection_id"])
    # One collection per transcription: prefer one its owner added.
    op.execute(
        """
        UPDATE transcriptions t SET collection_id = (
            SELECT ct.collection_id FROM collection_transcriptions ct
            WHERE ct.transcription_id = t.id
            ORDER BY (ct.added_by_id = t.user_id) DESC, ct.created_at
            LIMIT 1
        )
        """
    )
    op.drop_index("ix_collection_transcriptions_transcription_id", table_name="collection_transcriptions")
    op.drop_table("collection_transcriptions")
