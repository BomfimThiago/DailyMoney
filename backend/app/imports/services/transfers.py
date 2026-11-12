"""Money moving between two accounts of the family (paying the card bill, for instance).

The outflow in one account and the inflow in another are linked by amount and date,
and both stop counting as spending or income.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

MAX_DAYS = 3


@dataclass(frozen=True)
class Candidate:
    id: str
    account_id: str
    date: date
    amount: Decimal
    currency: str


def pair_transfers(incoming: list[Candidate], existing: list[Candidate]) -> dict[str, str]:
    """Incoming id → existing id it mirrors. Each side pairs at most once, closest date first."""
    options = [
        (abs((ex.date - inc.date).days), inc.id, ex.id)
        for inc in incoming
        for ex in existing
        if _mirrors(inc, ex)
    ]
    pairs: dict[str, str] = {}
    taken: set[str] = set()
    for _, inc_id, ex_id in sorted(options):
        if inc_id not in pairs and ex_id not in taken:
            pairs[inc_id] = ex_id
            taken.add(ex_id)
    return pairs


def _mirrors(inc: Candidate, ex: Candidate) -> bool:
    """The same money leaving one account and arriving in another, a few days apart."""
    return (
        inc.amount != 0
        and ex.amount == -inc.amount
        and ex.currency == inc.currency
        and ex.account_id != inc.account_id
        and abs((ex.date - inc.date).days) <= MAX_DAYS
    )
