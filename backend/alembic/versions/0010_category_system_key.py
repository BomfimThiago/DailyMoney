"""category system key

Revision ID: 5b7e21c4d9f0
Revises: 3a12f387dae2
Create Date: 2026-11-16 16:00:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5b7e21c4d9f0"
down_revision: Union[str, Sequence[str], None] = "3a12f387dae2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The names the app looks categories up by (categorize.DEFAULT_CATEGORIES), frozen here.
DEFAULT_NAMES = (
    "Moradia",
    "Mercado",
    "Restaurantes",
    "Transporte",
    "Lazer",
    "Saúde",
    "Assinaturas",
    "Outros",
    "Renda",
    "Transferência",
)


def upgrade() -> None:
    """Default categories keep a fixed key, so renaming one does not lose them."""
    op.add_column("category", sa.Column("system_key", sa.String(length=30), nullable=True))
    category = sa.table(
        "category", sa.column("name", sa.String), sa.column("system_key", sa.String)
    )
    op.execute(
        category.update()
        .where(category.c.name.in_(DEFAULT_NAMES))
        .values(system_key=category.c.name)
    )


def downgrade() -> None:
    op.drop_column("category", "system_key")
