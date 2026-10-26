"""Add organization-scoped parsed email records.

Revision ID: 0002_email_records
Revises: 0001_auth_schema
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_email_records"
down_revision = "0001_auth_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("submitted_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("parsed_result", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_records_organization_id", "email_records", ["organization_id"], unique=False)
    op.create_index("ix_email_records_submitted_by_user_id", "email_records", ["submitted_by_user_id"], unique=False)
    op.create_index("ix_email_records_uploaded_at", "email_records", ["uploaded_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_email_records_uploaded_at", table_name="email_records")
    op.drop_index("ix_email_records_submitted_by_user_id", table_name="email_records")
    op.drop_index("ix_email_records_organization_id", table_name="email_records")
    op.drop_table("email_records")
