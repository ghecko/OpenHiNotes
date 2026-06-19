"""Add registration controls: user status, registration_source, and registration settings

Revision ID: 007_registration_controls
Revises: 006b_app_settings
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "007_registration_controls"
down_revision = "006b_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum types first
    user_status_enum = sa.Enum("active", "pending", "rejected", name="userstatus")
    registration_source_enum = sa.Enum("self_registered", "admin_created", name="registrationsource")
    user_status_enum.create(op.get_bind(), checkfirst=True)
    registration_source_enum.create(op.get_bind(), checkfirst=True)

    # Add status column to users table (default active so existing users keep working)
    op.add_column(
        "users",
        sa.Column("status", user_status_enum, nullable=False, server_default="active"),
    )
    # Add registration_source column
    op.add_column(
        "users",
        sa.Column("registration_source", registration_source_enum, nullable=False, server_default="self_registered"),
    )

    # Seed default registration settings into app_settings
    op.execute(
        """
        INSERT INTO app_settings (key, value, description, updated_at)
        VALUES
            ('registration_enabled', 'true', 'Allow public self-registration', NOW()),
            ('registration_approval_required', 'false', 'Require admin approval for new registrations', NOW()),
            ('registration_allowed_domains', '', 'Comma-separated list of allowed email domains (empty = all domains)', NOW())
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_column("users", "registration_source")
    op.drop_column("users", "status")
    sa.Enum(name="registrationsource").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="userstatus").drop(op.get_bind(), checkfirst=True)

    op.execute("DELETE FROM app_settings WHERE key IN ('registration_enabled', 'registration_approval_required', 'registration_allowed_domains')")
