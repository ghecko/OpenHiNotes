"""Add title column to transcriptions

Revision ID: 002_add_title
Revises: 001_initial
Create Date: 2026-03-31
"""
from alembic import op
import sqlalchemy as sa

revision = '002_add_title'
down_revision = '001_initial'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column('transcriptions', sa.Column('title', sa.String(255), nullable=True))

def downgrade() -> None:
    op.drop_column('transcriptions', 'title')
