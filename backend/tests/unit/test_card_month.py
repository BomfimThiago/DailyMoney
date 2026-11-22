"""Which bill (and so which month) a card purchase counts in."""

from datetime import date

import pytest

from app.accounts.models import Account
from app.families.models import CardMonth
from app.transactions.services.card_month import bill_due, counts_on


@pytest.mark.parametrize(
    ("purchase", "close", "due", "expected"),
    [
        # Closes on the 3rd, due on the 10th of the same month.
        (date(2026, 11, 2), 3, 10, date(2026, 11, 10)),
        # On the closing day it already goes to the next bill.
        (date(2026, 11, 3), 3, 10, date(2026, 12, 10)),
        (date(2026, 10, 20), 3, 10, date(2026, 11, 10)),
        # Closes on the 25th, due on the 5th of the next month.
        (date(2026, 11, 20), 25, 5, date(2026, 12, 5)),
        (date(2026, 11, 26), 25, 5, date(2027, 1, 5)),
        # Across the year.
        (date(2026, 12, 15), 3, 10, date(2027, 1, 10)),
        # A short month uses its last day.
        (date(2027, 2, 10), 31, 7, date(2027, 3, 7)),
        (date(2027, 1, 20), 28, 31, date(2027, 1, 31)),
    ],
)
def test_bill_due(purchase: date, close: int, due: int, expected: date) -> None:
    assert bill_due(purchase, close, due) == expected


def _card(close: int | None = 3, due: int | None = 10, is_card: bool = True) -> Account:
    return Account(is_card=is_card, bill_close_day=close, bill_due_day=due)


def test_counts_on_the_bill_only_for_a_card_with_both_days() -> None:
    day = date(2026, 10, 20)
    assert counts_on(day, _card(), CardMonth.BILL) == date(2026, 11, 10)
    assert counts_on(day, _card(), CardMonth.PURCHASE) == day
    assert counts_on(day, _card(close=None), CardMonth.BILL) == day
    assert counts_on(day, _card(due=None), CardMonth.BILL) == day
    assert counts_on(day, _card(is_card=False), CardMonth.BILL) == day
