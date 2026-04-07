"""Add is_default column to templates and llm_system_prompt setting

Revision ID: 011_default_tpl_sysprompt
Revises: 010_cancel_and_voxhub_job_id
Create Date: 2026-04-06
"""
from alembic import op
import sqlalchemy as sa

revision = "011_default_tpl_sysprompt"
down_revision = "010_cancel_and_voxhub_job_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_default column to summary_templates
    op.add_column(
        "summary_templates",
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
    )

    # Add llm_system_prompt to app_settings
    op.execute(
        """
        INSERT INTO app_settings (key, value, description, updated_at)
        VALUES (
            'llm_system_prompt',
            'You are a professional meeting assistant. Your role is to analyze transcripts and produce clear, well-structured summaries in Markdown format. Always respond in the same language as the transcript. Be concise, factual, and action-oriented. Preserve speaker attributions when relevant. Use the section structure requested by the user prompt or template.',
            'Default system prompt sent to the LLM for summary generation and chat',
            NOW()
        )
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_column("summary_templates", "is_default")
    op.execute("DELETE FROM app_settings WHERE key = 'llm_system_prompt'")
