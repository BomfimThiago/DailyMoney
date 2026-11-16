"""fx rates

Revision ID: 3a12f387dae2
Revises: 397c25437ff5
Create Date: 2026-11-16 06:35:11.777374

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '3a12f387dae2'
down_revision: Union[str, Sequence[str], None] = '397c25437ff5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """European Central Bank rates, kept so each line converts with its own day's rate."""
    op.create_table('fx_rate',
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('currency', postgresql.ENUM(name='currency', create_type=False), nullable=False),
    sa.Column('per_eur', sa.Numeric(precision=18, scale=8), nullable=False),
    sa.Column('rate_date', sa.Date(), nullable=False),
    sa.PrimaryKeyConstraint('date', 'currency')
    )


def downgrade() -> None:
    op.drop_table('fx_rate')
