"""In which month a card purchase counts.

By default (`CardMonth.BILL`) a card purchase counts in the month its bill is paid: the
month the money really leaves the account. A market bought on 20 October on a card that
closes on the 3rd and is due on the 10th counts on 10 November, still in Mercado. The bill
payment itself stays out of the figures (card_payments.py), so nothing counts twice.

The family can go back to counting each purchase on its own day (`CardMonth.PURCHASE`).
A card without its closing and due days also counts each purchase on its own day: without
them the app can't tell which bill a purchase falls in.

The day each line counts on is kept in `Transaction.counts_on`, so every figure (Início,
Transações, Análises) reads the same month.
"""

import calendar
import uuid
from datetime import date

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.families.models import CardMonth, Family
from app.transactions.models import Transaction


def _on(year: int, month: int, day: int) -> date:
    """That day of the month, or the month's last day when it is shorter."""
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _next(day: date, wanted: int) -> date:
    year, month = (day.year + 1, 1) if day.month == 12 else (day.year, day.month + 1)
    return _on(year, month, wanted)


def bill_due(purchase: date, close_day: int, due_day: int) -> date:
    """The due day of the bill a purchase falls in.

    A purchase on the closing day already goes to the next bill (the banks' "melhor dia de
    compra"). The bill is due on the first due day after it closes.
    """
    closes = _on(purchase.year, purchase.month, close_day)
    if purchase >= closes:
        closes = _next(closes, close_day)
    due = _on(closes.year, closes.month, due_day)
    return due if due > closes else _next(closes, due_day)


def _by_bill(account: Account, by: str) -> bool:
    return (
        by == CardMonth.BILL
        and account.is_card
        and account.bill_close_day is not None
        and account.bill_due_day is not None
    )


def counts_on(day: date, account: Account, by: str) -> date:
    if _by_bill(account, by) and account.bill_close_day and account.bill_due_day:
        return bill_due(day, account.bill_close_day, account.bill_due_day)
    return day


async def _by(db: AsyncSession, family_id: uuid.UUID) -> str:
    by = await db.scalar(select(Family.card_purchases_by).where(Family.id == family_id))
    return by or CardMonth.BILL


async def recount(
    db: AsyncSession, family_id: uuid.UUID, account_id: uuid.UUID | None = None
) -> None:
    """Puts every card line of the family (or of one card) on the day it counts on."""
    by = await _by(db, family_id)
    query = select(Account).where(Account.family_id == family_id, Account.is_card.is_(True))
    if account_id is not None:
        query = query.where(Account.id == account_id)
    for card in await db.scalars(query):
        if not _by_bill(card, by):
            await db.execute(
                update(Transaction)
                .where(Transaction.account_id == card.id)
                .values(counts_on=Transaction.date)
            )
            continue
        lines = await db.scalars(select(Transaction).where(Transaction.account_id == card.id))
        for tx in lines:
            tx.counts_on = counts_on(tx.date, card, by)
    await db.flush()


async def recount_line(db: AsyncSession, tx: Transaction) -> None:
    """After the person changes a line's date."""
    account = await db.get(Account, tx.account_id)
    tx.counts_on = counts_on(tx.date, account, await _by(db, tx.family_id)) if account else tx.date
