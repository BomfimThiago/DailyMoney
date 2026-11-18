"""who each family member is (eu, cônjuge, família, outro)

Revision ID: 8b3e5f17c0d4
Revises: 4e9b7c1d2a83
Create Date: 2026-11-18 09:00:00

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "8b3e5f17c0d4"
down_revision: Union[str, Sequence[str], None] = "4e9b7c1d2a83"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KIND = sa.Enum("me", "spouse", "family", "other", name="member_kind")


def upgrade() -> None:
    """Each person says who they are; the one who signs in is "eu"."""
    KIND.create(op.get_bind(), checkfirst=True)
    op.add_column("member", sa.Column("kind", KIND, nullable=False, server_default="other"))
    op.execute("UPDATE member SET kind = 'me' WHERE user_id IS NOT NULL")


def downgrade() -> None:
    op.drop_column("member", "kind")
    KIND.drop(op.get_bind(), checkfirst=True)
