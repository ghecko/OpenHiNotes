"""Add collections table and collection_id to transcriptions

Revision ID: 004_add_collections
Revises: 003_add_chat_conversations
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '004_add_collections'
down_revision = '003_add_chat_conversations'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        'collections',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    op.add_column(
        'transcriptions',
        sa.Column(
            'collection_id',
            UUID(as_uuid=True),
            sa.ForeignKey('collections.id', ondelete='SET NULL'),
            nullable=True,
            index=True,
        ),
    )

def downgrade() -> None:
    op.drop_column('transcriptions', 'collection_id')
    op.drop_table('collections')
