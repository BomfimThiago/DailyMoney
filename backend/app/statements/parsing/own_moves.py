"""Money the family moves between its own pockets: investments and own-account moves.

Neither is spending or income. Investments get their own kind (they show in the
Investimentos tab); moves between the family's accounts are transfers. Only wording banks
use for exactly that goes here; a Pix to someone else never matches.
"""

import re
import unicodedata
from typing import Literal

OwnMove = Literal["investment", "transfer"]

_INVESTMENT = [
    # Nubank, Inter, Itaú: investing and redeeming
    r"^(aplicacao|resgate)\b",
    r"^(compra|venda) de acoes\b",
    r"\b(rdb|cdb|lci|lca|tesouro (direto|selic|prefixado|ipca))\b",
    # Inter: Tesouro Direto and stock purchases at B3. Rent and dividend credits
    # ("Credito B3 Btb", "Credito Evento B3") are income and stay out.
    r"^debito online td\b",
    r"^(debito|credito) b3\b(?! btb)",
    # Spanish banks
    r"^inversion(es)?\b",
    # Revolut pockets and savings: "To EUR <pocket>", "From EUR <pocket>"
    r"^(to|from) (eur|usd|gbp|brl) ",
]
_TRANSFER = [
    # Inter: the holder's own dollar Global Account
    r"^deposito:? global account\b",
    # CaixaBank: between the holder's own accounts
    r"^traspaso propio\b",
]


def _compile(patterns: list[str]) -> re.Pattern[str]:
    return re.compile("|".join(f"(?:{p})" for p in patterns))


_INVESTMENT_RE = _compile(_INVESTMENT)
_TRANSFER_RE = _compile(_TRANSFER)
# Words that only say what happened, not which product: "Aplicação RDB" → "RDB".
_ACTION = re.compile(
    r"^\s*(aplica[cç][aã]o|resgate|compra de a[cç][oõ]es|venda de a[cç][oõ]es"
    r"|d[eé]bito online td|d[eé]bito b3|cr[eé]dito b3|inversi[oó]n(es)?"
    r"|(to|from) (eur|usd|gbp|brl))\b[\s:\-–]*",
    re.IGNORECASE,
)


def _plain(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch)).strip()


def own_move_kind(description: str) -> OwnMove | None:
    plain = _plain(description)
    if _INVESTMENT_RE.search(plain):
        return "investment"
    if _TRANSFER_RE.search(plain):
        return "transfer"
    return None


def product_name(description: str) -> str:
    """Name of the investment a line refers to, without the action word."""
    rest = _ACTION.sub("", description, count=1).strip(" :-–\"'")
    return rest or description.strip()
