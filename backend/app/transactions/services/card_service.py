"""Credit card bills: what each card charges the account in a month, and if it was paid.

The purchases keep counting in the month they were made, each in its category (that is
the rest of the app). This is the card's cash side: the bank groups purchases into a bill
(`Transaction.card_bill`, YYYY-MM, as the bank says) that leaves the account in one go.
Bills are calendar months, like the bank's, whatever day the family's month starts.
Paying the bill is money moving between the family's own accounts (a transfer, or a
credit on the card), so it never counts in a bill's total.
"""

import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.families.models import Currency
from app.fx.services.fx_service import Converter, converter
from app.transactions.models import APPROVED, Transaction, TxKind
from app.transactions.schemas import CardBill, CardBills, CardBillsOverview, CardPayment
from app.transactions.services.months import month_range, shift

ZERO = Decimal(0)
CENTS = Decimal("0.01")
# Lines that are purchases (or refunds) of a bill; payments are transfers.
_PURCHASES = (TxKind.REGULAR, TxKind.PENDING, TxKind.INVESTMENT)
# Tests set the day.
clock = date.today


def _bounds(month: str) -> tuple[date, date]:
    """The calendar month: first day and the first day after it."""
    first, last = month_range(month)
    return first, last + timedelta(days=1)


@dataclass
class _Card:
    account: Account
    bill: list[Transaction] = field(default_factory=list)
    next: list[Transaction] = field(default_factory=list)
    payments: list[Transaction] = field(default_factory=list)
    months: set[str] = field(default_factory=set)


async def card_bills(
    db: AsyncSession,
    family_id: uuid.UUID,
    month: str,
    currency: Currency | None = None,
) -> CardBillsOverview:
    start, end = _bounds(month)
    following = shift(month, 1)
    accounts = (
        await db.scalars(
            select(Account)
            .where(Account.family_id == family_id, Account.is_card.is_(True))
            .order_by(Account.created_at)
        )
    ).all()
    cards = {a.id: _Card(a) for a in accounts}
    if not cards:
        return CardBillsOverview(month=month, bills_known=False, cards=[])

    lines = (
        await db.scalars(
            select(Transaction).where(
                Transaction.account_id.in_(cards),
                APPROVED,
                (Transaction.card_bill.is_not(None))
                | (Transaction.date >= start) & (Transaction.date < end),
            )
        )
    ).all()
    for tx in lines:
        card = cards[tx.account_id]
        if tx.card_bill and tx.kind in _PURCHASES:
            card.months.add(tx.card_bill)
            if tx.card_bill == month:
                card.bill.append(tx)
            elif tx.card_bill == following:
                card.next.append(tx)
        if _is_payment(tx) and start <= tx.date < end:
            card.payments.append(tx)

    dates = [tx.date for tx in lines]
    conv = await converter(db, currency, min(dates, default=None), max(dates, default=None))
    today = clock()
    known = [c for c in cards.values() if c.months]
    return CardBillsOverview(
        month=month,
        bills_known=bool(known),
        cards=[_out(c, month, following, conv, over=today >= end) for c in known],
    )


def _is_payment(tx: Transaction) -> bool:
    # Money arriving on the card that isn't a refund of a purchase.
    return tx.amount > 0 and tx.kind == TxKind.TRANSFER


def _owed(lines: list[Transaction], conv: Converter) -> Decimal:
    # Purchases are negative on the card; what the bill charges is their opposite.
    return -sum((conv(t.amount, t.currency, t.date) for t in lines), ZERO)


def _out(card: _Card, month: str, following: str, conv: Converter, over: bool) -> CardBills:
    account = card.account
    total = _owed(card.bill, conv).quantize(CENTS)
    payments = sorted(card.payments, key=lambda t: t.date)
    paid = sum((conv(t.amount, t.currency, t.date) for t in payments), ZERO).quantize(CENTS)
    return CardBills(
        account_id=account.id,
        account_name=account.name,
        bank=account.bank,
        currency=conv.currency(account.currency),
        bill=CardBill(month=month, total=total, count=len(card.bill)),
        next=CardBill(
            month=following, total=_owed(card.next, conv).quantize(CENTS), count=len(card.next)
        ),
        payments=[
            CardPayment(date=t.date, amount=conv(t.amount, t.currency, t.date).quantize(CENTS))
            for t in payments
        ],
        paid=paid,
        status=_status(total, paid, over),
        months=sorted(card.months, reverse=True),
    )


Status = Literal["paid", "open", "unpaid", "empty"]


def _status(total: Decimal, paid: Decimal, over: bool) -> Status:
    if total <= 0 and paid <= 0:
        return "empty"
    # A few cents of rounding (converted amounts) still count as paid.
    if paid > 0 and paid >= total - Decimal("1"):
        return "paid"
    return "unpaid" if over else "open"
