"""drop pluggy connections made from item ids

Revision ID: 397c25437ff5
Revises: fa275733ce32
Create Date: 2026-11-16 05:25:42.732491

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '397c25437ff5'
down_revision: Union[str, Sequence[str], None] = 'fa275733ce32'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Brazilian banks are now authorized from the app. The connections made from item ids
    listed on the server go away, so each bank is connected again the new way; the
    transactions and accounts they brought stay."""
    op.execute("DELETE FROM bank_connection WHERE provider = 'pluggy'")


def downgrade() -> None:
    """The removed connections can't be brought back; connect the banks again."""
