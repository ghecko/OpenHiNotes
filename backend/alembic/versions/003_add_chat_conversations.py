"""Add chat_conversations table

Revision ID: 003_add_chat_conversations
Revises: 002_add_title
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '003_add_chat_conversations'
down_revision = '002_add_title'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        'chat_conversations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('transcription_id', UUID(as_uuid=True), sa.ForeignKey('transcriptions.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('messages', sa.JSON, nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

def downgrade() -> None:
    op.drop_table('chat_conversations')
