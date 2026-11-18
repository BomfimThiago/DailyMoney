"""investments of connected banks

Revision ID: c41e8b7d2a90
Revises: 8d3f6a2b1c55
Create Date: 2026-11-17 17:00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c41e8b7d2a90"
down_revision: Union[str, Sequence[str], None] = "8d3f6a2b1c55"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """The bank's own investment balances (Pluggy), and each one's balance per day."""
    currency = postgresql.ENUM("BRL", "USD", "EUR", name="currency", create_type=False)
    op.create_table(
        "investment",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("connection_id", sa.Uuid(), nullable=True),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("external_id", sa.String(length=200), nullable=False),
        sa.Column("bank", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("subtype", sa.String(length=60), nullable=True),
        sa.Column("issuer", sa.String(length=200), nullable=True),
        sa.Column("code", sa.String(length=60), nullable=True),
        sa.Column("currency", currency, nullable=False),
        sa.Column("balance", sa.Numeric(18, 4), nullable=False),
        sa.Column("amount_original", sa.Numeric(18, 4), nullable=True),
        sa.Column("rate", sa.Numeric(18, 8), nullable=True),
        sa.Column("rate_type", sa.String(length=20), nullable=True),
        sa.Column("fixed_annual_rate", sa.Numeric(18, 8), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("value_date", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["connection_id"], ["bank_connection.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("family_id", "provider", "external_id", name="uq_investment_external"),
    )
    op.create_index("ix_investment_family_id", "investment", ["family_id"])
    op.create_index("ix_investment_connection_id", "investment", ["connection_id"])
    op.create_table(
        "investment_snapshot",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("investment_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("balance", sa.Numeric(18, 4), nullable=False),
        sa.ForeignKeyConstraint(["investment_id"], ["investment.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("investment_id", "date", name="uq_investment_snapshot"),
    )
    op.create_index(
        "ix_investment_snapshot_investment_id", "investment_snapshot", ["investment_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_investment_snapshot_investment_id", table_name="investment_snapshot")
    op.drop_table("investment_snapshot")
    op.drop_index("ix_investment_connection_id", table_name="investment")
    op.drop_index("ix_investment_family_id", table_name="investment")
    op.drop_table("investment")
