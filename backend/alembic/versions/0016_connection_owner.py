"""a bank can be connected more than once (each person's Revolut), each with an owner

Revision ID: 5d2c8a91e4b7
Revises: 8b3e5f17c0d4
Create Date: 2026-11-18 15:30:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "5d2c8a91e4b7"
down_revision: Union[str, Sequence[str], None] = "8b3e5f17c0d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drops one-connection-per-bank; each connection says whose new accounts are."""
    op.drop_constraint("uq_bank_connection_bank", "bank_connection", type_="unique")
    op.add_column("bank_connection", sa.Column("member_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_bank_connection_member_id_member",
        "bank_connection",
        "member",
        ["member_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # Until now new accounts went to whoever connected the bank.
    op.execute(
        "UPDATE bank_connection c SET member_id = m.id FROM member m WHERE m.user_id = c.user_id"
    )


def downgrade() -> None:
    # Keeps the oldest connection of each bank, as before.
    op.execute(
        "DELETE FROM bank_connection c USING bank_connection o "
        "WHERE c.family_id = o.family_id AND c.provider = o.provider AND c.bank = o.bank "
        "AND (o.created_at, o.id) < (c.created_at, c.id)"
    )
    op.drop_constraint("fk_bank_connection_member_id_member", "bank_connection", type_="foreignkey")
    op.drop_column("bank_connection", "member_id")
    op.create_unique_constraint(
        "uq_bank_connection_bank", "bank_connection", ["family_id", "provider", "bank"]
    )
