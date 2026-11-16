"""review imported transactions before they count

Revision ID: 6b8e2f1c9a47
Revises: 3a12f387dae2
Create Date: 2026-11-16 15:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '6b8e2f1c9a47'
down_revision: Union[str, Sequence[str], None] = '3a12f387dae2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

review_status = postgresql.ENUM('approved', 'pending', 'rejected', name='review_status')


def upgrade() -> None:
    """Imported lines wait for approval; what is already there stays approved."""
    review_status.create(op.get_bind())
    op.add_column(
        'transaction',
        sa.Column(
            'review',
            postgresql.ENUM(name='review_status', create_type=False),
            server_default='approved',
            nullable=False,
        ),
    )
    op.create_index(
        'ix_transaction_family_review', 'transaction', ['family_id', 'review'], unique=False
    )
    op.add_column(
        'family',
        sa.Column('review_imports', sa.Boolean(), server_default=sa.true(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('family', 'review_imports')
    op.drop_index('ix_transaction_family_review', table_name='transaction')
    op.drop_column('transaction', 'review')
    review_status.drop(op.get_bind())
