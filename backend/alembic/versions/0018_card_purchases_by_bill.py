"""card purchases count in the month of their bill

Revision ID: 7b3e9d2f4a61
Revises: 9e4a2c7b5d13
Create Date: 2026-11-21 15:00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "7b3e9d2f4a61"
down_revision: Union[str, Sequence[str], None] = "9e4a2c7b5d13"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "family",
        sa.Column("card_purchases_by", sa.String(10), nullable=False, server_default="bill"),
    )
    op.add_column("account", sa.Column("bill_close_day", sa.SmallInteger(), nullable=True))
    op.add_column("account", sa.Column("bill_due_day", sa.SmallInteger(), nullable=True))
    # No card has its days yet, so every line still counts on its own day.
    op.add_column("transaction", sa.Column("counts_on", sa.Date(), nullable=True))
    op.execute('UPDATE "transaction" SET counts_on = date')
    op.alter_column("transaction", "counts_on", nullable=False)
    op.create_index("ix_transaction_family_counts_on", "transaction", ["family_id", "counts_on"])


def downgrade() -> None:
    op.drop_index("ix_transaction_family_counts_on", table_name="transaction")
    op.drop_column("transaction", "counts_on")
    op.drop_column("account", "bill_due_day")
    op.drop_column("account", "bill_close_day")
    op.drop_column("family", "card_purchases_by")
