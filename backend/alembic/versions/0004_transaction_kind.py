"""transaction kind: regular, investment, transfer, pending

Revision ID: 7c2d9a41e0b3
Revises: 95ea3a3ab601
Create Date: 2026-11-10 14:00:00

Investments stop being transfers and get their own kind. Lines that look like a Pix to
a family member, with no other side found, wait for the person to confirm them.
"""

import re
import unicodedata
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "7c2d9a41e0b3"
down_revision: Union[str, Sequence[str], None] = "95ea3a3ab601"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TX_KIND = postgresql.ENUM("regular", "investment", "transfer", "pending", name="tx_kind")

# Frozen copies of the rules at the time of this migration (app code may change later).
_INVESTMENT = re.compile(
    r"(?:^(aplicacao|resgate)\b)|(?:^(compra|venda) de acoes\b)"
    r"|(?:\b(rdb|cdb|lci|lca|tesouro (direto|selic|prefixado|ipca))\b)"
    r"|(?:^debito online td\b)|(?:^(debito|credito) b3\b(?! btb))"
    r"|(?:^inversion(es)?\b)|(?:^(to|from) (eur|usd|gbp|brl) )"
)
_MOVE_WORDS = re.compile(
    r"\b(pix|ted|doc|transf\w*|traspaso|bizum|payment|sent|received|money|envi\w*|receb\w*)\b"
)
_PARTICLES = {"de", "da", "do", "das", "dos", "e", "del", "la", "y"}


def _plain(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch)).strip()


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z]+", _plain(text))


def _self_transfer(description: str, names: list[tuple[str, str]]) -> bool:
    plain = " ".join(_words(description))
    if not _MOVE_WORDS.search(plain):
        return False
    words = set(plain.split())
    return any(first in words and last in words for first, last in names)


def upgrade() -> None:
    bind = op.get_bind()
    TX_KIND.create(bind)
    op.add_column(
        "transaction",
        sa.Column("kind", TX_KIND, nullable=False, server_default="regular"),
    )
    op.execute("UPDATE transaction SET kind = 'transfer' WHERE is_transfer")

    rows = bind.execute(
        sa.text("SELECT id, description FROM transaction WHERE is_transfer")
    ).all()
    investments = [r.id for r in rows if _INVESTMENT.search(_plain(r.description))]
    if investments:
        bind.execute(
            sa.text(
                "UPDATE transaction SET kind = 'investment', category_id = NULL "
                "WHERE id = ANY(:ids)"
            ),
            {"ids": investments},
        )

    names: dict[object, list[tuple[str, str]]] = {}
    people = sa.text(
        "SELECT family_id, name FROM app_user UNION SELECT family_id, name FROM member"
    )
    for family_id, name in bind.execute(people):
        words = [w for w in _words(name) if w not in _PARTICLES]
        if len(words) >= 2:
            names.setdefault(family_id, []).append((words[0], words[-1]))
    regular = bind.execute(
        sa.text("SELECT id, family_id, description FROM transaction WHERE NOT is_transfer")
    ).all()
    pending = [
        r.id for r in regular if _self_transfer(r.description, names.get(r.family_id, []))
    ]
    if pending:
        bind.execute(
            sa.text(
                "UPDATE transaction SET kind = 'pending', category_id = NULL WHERE id = ANY(:ids)"
            ),
            {"ids": pending},
        )

    op.alter_column("transaction", "kind", server_default=None)
    op.drop_column("transaction", "is_transfer")
    op.drop_column("statement_import", "transfer_count")


def downgrade() -> None:
    op.add_column(
        "statement_import",
        sa.Column("transfer_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "transaction",
        sa.Column("is_transfer", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(
        "UPDATE transaction SET is_transfer = true WHERE kind IN ('transfer', 'investment')"
    )
    op.alter_column("transaction", "is_transfer", server_default=None)
    op.alter_column("statement_import", "transfer_count", server_default=None)
    op.drop_column("transaction", "kind")
    TX_KIND.drop(op.get_bind())
