"""investment category

Revision ID: 8d3f6a2b1c55
Revises: 5b7e21c4d9f0
Create Date: 2026-11-17 09:00:00

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "8d3f6a2b1c55"
down_revision: Union[str, Sequence[str], None] = "5b7e21c4d9f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen here, like the other default names (categorize.INVESTMENT).
NAME = "Investimento"
COLOR = "#3d5ac2"


def upgrade() -> None:
    """Investment moves now count as spending or income, under the category Investimento."""
    # A family that already made its own Investimento keeps it, now as the default one.
    op.execute(
        f"""
        UPDATE category SET system_key = '{NAME}'
        WHERE name = '{NAME}' AND system_key IS NULL
        """
    )
    op.execute(
        f"""
        INSERT INTO category (id, family_id, name, kind, color, sort_order, system_key, created_at)
        SELECT gen_random_uuid(), f.id, '{NAME}', 'expense', '{COLOR}',
               COALESCE((SELECT MAX(c.sort_order) FROM category c WHERE c.family_id = f.id), 0) + 1,
               '{NAME}', now()
        FROM family f
        WHERE NOT EXISTS (
            SELECT 1 FROM category c WHERE c.family_id = f.id AND c.system_key = '{NAME}'
        )
        """
    )
    op.execute(
        f"""
        UPDATE transaction t SET category_id = c.id
        FROM category c
        WHERE c.family_id = t.family_id AND c.system_key = '{NAME}' AND t.kind = 'investment'
        """
    )


def downgrade() -> None:
    """Investment lines go back to having no category; the category this added goes away.

    One the family had made itself (another colour) only loses its default key.
    """
    op.execute("UPDATE transaction SET category_id = NULL WHERE kind = 'investment'")
    added = f"system_key = '{NAME}' AND color = '{COLOR}'"
    op.execute(
        f"DELETE FROM category_rule r USING category c WHERE r.category_id = c.id AND c.{added}"
    )
    op.execute(f"DELETE FROM category WHERE {added}")
    op.execute(f"UPDATE category SET system_key = NULL WHERE system_key = '{NAME}'")
