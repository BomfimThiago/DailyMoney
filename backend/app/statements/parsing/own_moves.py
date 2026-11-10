"""Money the family moves between its own pockets: investments and own-account moves.

These are not spending or income, so they import as transfers. Only wording banks use
for exactly that goes here; a Pix to someone else never matches.
"""

import re
import unicodedata

_PATTERNS = [
    # Nubank, Inter, Itaú: investing and redeeming
    r"^(aplicacao|resgate)\b",
    r"^(compra|venda) de acoes\b",
    r"\b(rdb|cdb|lci|lca|tesouro (direto|selic|prefixado|ipca))\b",
    # Inter: the dollar Global Account, Tesouro Direto and stock purchases at B3. Rent and
    # dividend credits ("Credito B3 Btb", "Credito Evento B3") are income and stay out.
    r"^deposito:? global account\b",
    r"^debito online td\b",
    r"^(debito|credito) b3\b(?! btb)",
    # CaixaBank and other Spanish banks
    r"^traspaso propio\b",
    r"^inversion(es)?\b",
    # Revolut pockets and savings: "To EUR <pocket>", "From EUR <pocket>"
    r"^(to|from) (eur|usd|gbp|brl) ",
]
_OWN_MOVE = re.compile("|".join(f"(?:{p})" for p in _PATTERNS))


def _plain(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch)).strip()


def is_own_move(description: str) -> bool:
    return bool(_OWN_MOVE.search(_plain(description)))
