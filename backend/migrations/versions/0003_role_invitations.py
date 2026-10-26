"""Add secure, organization-scoped role invitations.

Revision ID: 0003_role_invitations
Revises: 0002_email_records
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_role_invitations"
down_revision = "0002_email_records"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "role_invitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "role",
            sa.Enum("employee", "soc_analyst", "organization_admin", name="invitation_role"),
            nullable=False,
        ),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("invited_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_role_invitations_email", "role_invitations", ["email"], unique=False)
    op.create_index("ix_role_invitations_token_hash", "role_invitations", ["token_hash"], unique=True)
    op.create_index("ix_role_invitations_organization_id", "role_invitations", ["organization_id"], unique=False)
    op.create_index("ix_role_invitations_invited_by_user_id", "role_invitations", ["invited_by_user_id"], unique=False)
    op.create_index("ix_role_invitations_expires_at", "role_invitations", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_role_invitations_expires_at", table_name="role_invitations")
    op.drop_index("ix_role_invitations_invited_by_user_id", table_name="role_invitations")
    op.drop_index("ix_role_invitations_organization_id", table_name="role_invitations")
    op.drop_index("ix_role_invitations_token_hash", table_name="role_invitations")
    op.drop_index("ix_role_invitations_email", table_name="role_invitations")
    op.drop_table("role_invitations")
