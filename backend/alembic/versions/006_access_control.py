"""Add access control: user groups, group members, resource shares

Revision ID: 006_access_control
Revises: 005_add_collection_color
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa

revision = '006_access_control'
down_revision = '005_add_collection_color'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # User groups table
    op.create_table(
        'user_groups',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_user_groups_created_by', 'user_groups', ['created_by'])

    # Group membership (M:N)
    op.create_table(
        'user_group_members',
        sa.Column('group_id', sa.Uuid(), sa.ForeignKey('user_groups.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('added_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # Resource shares (polymorphic)
    op.create_table(
        'resource_shares',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('resource_type', sa.Enum('transcription', 'collection', name='resourcetype'), nullable=False),
        sa.Column('resource_id', sa.Uuid(), nullable=False),
        sa.Column('grantee_type', sa.Enum('user', 'group', name='granteetype'), nullable=False),
        sa.Column('grantee_id', sa.Uuid(), nullable=False),
        sa.Column('permission', sa.Enum('read', 'write', name='permissionlevel'), nullable=False, server_default='read'),
        sa.Column('granted_by', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_resource_shares_resource', 'resource_shares', ['resource_type', 'resource_id'])
    op.create_index('ix_resource_shares_grantee', 'resource_shares', ['grantee_type', 'grantee_id'])
    op.create_index(
        'uq_resource_shares_unique', 'resource_shares',
        ['resource_type', 'resource_id', 'grantee_type', 'grantee_id'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_table('resource_shares')
    op.execute("DROP TYPE IF EXISTS resourcetype")
    op.execute("DROP TYPE IF EXISTS granteetype")
    op.execute("DROP TYPE IF EXISTS permissionlevel")
    op.drop_table('user_group_members')
    op.drop_table('user_groups')
