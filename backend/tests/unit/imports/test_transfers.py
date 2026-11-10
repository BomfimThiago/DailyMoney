from datetime import date
from decimal import Decimal

from app.imports.services.transfers import Candidate, pair_transfers


def _c(id: str, account: str, d: str, amount: str, cur: str = "BRL") -> Candidate:
    return Candidate(
        id=id, account_id=account, date=date.fromisoformat(d), amount=Decimal(amount), currency=cur
    )


def test_card_payment_pairs_with_card_credit() -> None:
    incoming = [_c("in1", "card", "2026-10-11", "500")]
    existing = [_c("ex1", "checking", "2026-10-10", "-500")]
    assert pair_transfers(incoming, existing) == {"in1": "ex1"}


def test_same_account_or_currency_or_far_date_does_not_pair() -> None:
    incoming = [
        _c("a", "checking", "2026-10-10", "500"),
        _c("b", "card", "2026-10-10", "500", cur="EUR"),
        _c("c", "card", "2026-10-20", "500"),
    ]
    existing = [_c("ex1", "checking", "2026-10-10", "-500")]
    assert pair_transfers(incoming, existing) == {}


def test_each_existing_pairs_once_and_closest_date_wins() -> None:
    incoming = [_c("a", "card", "2026-10-12", "100"), _c("b", "card", "2026-10-10", "100")]
    existing = [_c("ex1", "checking", "2026-10-10", "-100")]
    assert pair_transfers(incoming, existing) == {"b": "ex1"}
