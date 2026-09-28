"""Background summary generation: status, phase, reasoning, timestamps.

Summaries used to be generated inside the HTTP request and only stored once
complete, which timed out with slow (dense, thinking) models. They are now
created immediately as `pending` and filled by the summary queue
(app/services/summary_queue.py). Existing rows are complete.

Note: alembic_version.version_num is VARCHAR(32); keep revision ids <= 32 chars.

Revision ID: 032_summary_jobs
Revises: 031_voice_profile_model
"""
from alembic import op
import sqlalchemy as sa

revision = "032_summary_jobs"
down_revision = "031_voice_profile_model"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("summaries", sa.Column("status", sa.String(20), nullable=False, server_default="completed"))
    op.add_column("summaries", sa.Column("phase", sa.String(20), nullable=True))
    op.add_column("summaries", sa.Column("error_message", sa.Text(), nullable=True))
    op.add_column("summaries", sa.Column("custom_prompt", sa.Text(), nullable=True))
    op.add_column("summaries", sa.Column("reasoning_level", sa.String(20), nullable=True))
    op.add_column("summaries", sa.Column("reasoning", sa.Text(), nullable=True))
    op.add_column("summaries", sa.Column("started_at", sa.DateTime(), nullable=True))
    op.add_column("summaries", sa.Column("completed_at", sa.DateTime(), nullable=True))
    op.add_column("summaries", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.create_index("ix_summaries_status", "summaries", ["status"])
    # Pending rows are inserted before the LLM answered.
    op.alter_column("summaries", "content", server_default="")
    op.alter_column("summaries", "model_used", server_default="")


def downgrade() -> None:
    # Unfinished summaries have no content worth keeping.
    op.execute("DELETE FROM summaries WHERE status <> 'completed'")
    op.alter_column("summaries", "model_used", server_default=None)
    op.alter_column("summaries", "content", server_default=None)
    op.drop_index("ix_summaries_status", table_name="summaries")
    for col in ("updated_at", "completed_at", "started_at", "reasoning", "reasoning_level",
                "custom_prompt", "error_message", "phase", "status"):
        op.drop_column("summaries", col)
