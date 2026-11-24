"""Remember which HiDock a recording came from, and what each device held.

transcriptions.source_kind: where the audio came from, "device" (a HiDock),
"upload" (a file uploaded in the browser) or "recording" (recorded in the
browser). NULL on rows created before this migration and on combined ones.

transcriptions.source_device_serial / source_device_model: the device the
audio was pulled from (NULL unless source_kind is "device"; older rows are
stamped the next time a connected device lists their file).

user_devices: one row per (user, device serial) with an optional name the
user gave it and the file names seen the last time the device was connected,
so a recording that lives on a device that is not plugged in right now is not
reported as missing.

Note: alembic_version.version_num is VARCHAR(32); keep revision ids <= 32 chars.

Revision ID: 035_source_device
Revises: 034_collection_memberships
"""
from alembic import op
import sqlalchemy as sa

revision = "035_source_device"
down_revision = "034_collection_memberships"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transcriptions", sa.Column("source_kind", sa.String(16), nullable=True))
    op.add_column("transcriptions", sa.Column("source_device_serial", sa.String(64), nullable=True))
    op.add_column("transcriptions", sa.Column("source_device_model", sa.String(32), nullable=True))
    op.create_table(
        "user_devices",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("serial", sa.String(64), nullable=False),
        sa.Column("model", sa.String(32), nullable=True),
        sa.Column("name", sa.String(60), nullable=True),
        sa.Column("file_names", sa.JSON(), nullable=False),
        sa.Column("files_seen_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "serial", name="uq_user_devices_user_serial"),
    )
    op.create_index("ix_user_devices_user_id", "user_devices", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_devices_user_id", table_name="user_devices")
    op.drop_table("user_devices")
    op.drop_column("transcriptions", "source_device_model")
    op.drop_column("transcriptions", "source_device_serial")
    op.drop_column("transcriptions", "source_kind")
