"""Add OIDC provider and user identity tables for SSO support

Revision ID: 016_oidc_support
Revises: 015_password_reset
Create Date: 2026-04-09
"""
from alembic import op
import sqlalchemy as sa

revision = "016_oidc_support"
down_revision = "015_password_reset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create oidc_providers table
    op.create_table(
        "oidc_providers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("slug", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("icon", sa.String(100), nullable=True),
        # OIDC configuration
        sa.Column("discovery_url", sa.String(500), nullable=False),
        sa.Column("client_id", sa.String(500), nullable=False),
        sa.Column("client_secret_encrypted", sa.Text(), nullable=False),
        sa.Column("scopes", sa.String(500), nullable=False, server_default="openid email profile"),
        # Endpoint overrides
        sa.Column("authorize_url_override", sa.String(500), nullable=True),
        sa.Column("token_url_override", sa.String(500), nullable=True),
        sa.Column("userinfo_url_override", sa.String(500), nullable=True),
        sa.Column("jwks_uri_override", sa.String(500), nullable=True),
        # Behavior
        sa.Column("auto_provision", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("default_role", sa.String(50), nullable=False, server_default="user"),
        sa.Column("allowed_domains", sa.Text(), nullable=True),
        sa.Column("require_approval", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        # Claim mapping
        sa.Column("email_claim", sa.String(100), nullable=False, server_default="email"),
        sa.Column("name_claim", sa.String(100), nullable=False, server_default="name"),
        sa.Column("role_claim", sa.String(100), nullable=True),
        sa.Column("role_mapping", sa.Text(), nullable=True),
        # State
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # 2. Create user_identities table
    op.create_table(
        "user_identities",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "provider_id",
            sa.Uuid(),
            sa.ForeignKey("oidc_providers.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("raw_claims", sa.Text(), nullable=True),
        sa.Column("last_login", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("provider_id", "subject", name="uq_identity_provider_subject"),
    )

    # 3. Add 'oidc' to registration_source enum (PostgreSQL)
    op.execute("ALTER TYPE registrationsource ADD VALUE IF NOT EXISTS 'oidc'")


def downgrade() -> None:
    op.drop_table("user_identities")
    op.drop_table("oidc_providers")
    # Note: PostgreSQL does not support removing values from enums.
    # The 'oidc' value will remain in the registrationsource enum.
