"""card bill month and installment on transactions

Revision ID: 4e9b7c1d2a83
Revises: c41e8b7d2a90
Create Date: 2026-11-17 17:00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "4e9b7c1d2a83"
down_revision: Union[str, Sequence[str], None] = "c41e8b7d2a90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """A card purchase knows the bill it falls into (YYYY-MM) and its installment ("3/10")."""
    op.add_column("transaction", sa.Column("card_bill", sa.String(7), nullable=True))
    op.add_column("transaction", sa.Column("installment", sa.String(10), nullable=True))
    op.create_index(
        "ix_transaction_account_bill", "transaction", ["account_id", "card_bill"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_transaction_account_bill", table_name="transaction")
    op.drop_column("transaction", "installment")
    op.drop_column("transaction", "card_bill")
