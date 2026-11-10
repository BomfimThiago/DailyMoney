"""Month summary, investments and transfers (spec: Início, Investimentos, Transferências).

Values stay in each account's own currency: there is one summary per currency until
conversion (European Central Bank rates) arrives.
"""

import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.categories.models import Category
from app.families.models import Currency, Family
from app.statements.parsing.own_moves import product_name
from app.transactions.models import Transaction, TxKind
from app.transactions.schemas import (
    CurrencySummary,
    InvestmentMonth,
    InvestmentOverview,
    InvestmentProduct,
    MonthSummary,
    TransactionOut,
    TransferOut,
    TransferOverview,
)
from app.transactions.services.months import month_of, month_range, shift
from app.transactions.services.transaction_service import to_out

ZERO = Decimal("0")
HISTORY_MONTHS = 6


async def _currencies(db: AsyncSession, family_id: uuid.UUID) -> list[Currency]:
    family = await db.get(Family, family_id)
    used = set(
        await db.scalars(select(Account.currency).where(Account.family_id == family_id).distinct())
    )
    first = family.display_currency if family else Currency.BRL
    return sorted(used, key=lambda c: (c != first, c.value))


async def month_summary(db: AsyncSession, family_id: uuid.UUID, month: str) -> MonthSummary:
    lo, hi = month_range(month)
    rows = await db.execute(
        select(Transaction.currency, Transaction.kind, Transaction.amount).where(
            Transaction.family_id == family_id,
            Transaction.date.between(lo, hi),
            Transaction.kind.in_([TxKind.REGULAR, TxKind.INVESTMENT]),
        )
    )
    sums: dict[Currency, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    for currency, kind, amount in rows:
        s = sums[currency]
        if kind == TxKind.REGULAR:
            s["income" if amount > 0 else "spending"] += abs(amount)
        else:
            s["taken_out" if amount > 0 else "put_in"] += abs(amount)

    out = []
    for currency in await _currencies(db, family_id):
        s = sums[currency]
        invested = s["put_in"] - s["taken_out"]
        out.append(
            CurrencySummary(
                currency=currency,
                income=s["income"],
                spending=s["spending"],
                invested=invested,
                invested_in=s["put_in"],
                invested_out=s["taken_out"],
                left=s["income"] - s["spending"] - invested,
            )
        )
    pending = await db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(Transaction.family_id == family_id, Transaction.kind == TxKind.PENDING)
    )
    return MonthSummary(month=month, currencies=out, pending_transfers=pending or 0)


async def _with_names(
    db: AsyncSession, family_id: uuid.UUID, *where: object
) -> list[tuple[Transaction, str, str | None]]:
    rows = await db.execute(
        select(Transaction, Account.name, Category.name)
        .join(Account, Account.id == Transaction.account_id)
        .outerjoin(Category, Category.id == Transaction.category_id)
        .where(Transaction.family_id == family_id, *where)  # type: ignore[arg-type]
        .order_by(Transaction.date.desc(), Transaction.created_at.desc(), Transaction.id)
    )
    return [(tx, account_name, category_name) for tx, account_name, category_name in rows]


async def investments(db: AsyncSession, family_id: uuid.UUID, month: str) -> InvestmentOverview:
    lo, hi = month_range(month)
    rows = await _with_names(db, family_id, Transaction.kind == TxKind.INVESTMENT)

    products: dict[tuple[uuid.UUID, str], InvestmentProduct] = {}
    first_month = shift(month, -(HISTORY_MONTHS - 1))
    history: dict[tuple[str, Currency], list[Decimal]] = defaultdict(lambda: [ZERO, ZERO])
    movements: list[TransactionOut] = []
    for tx, account_name, category_name in rows:  # newest first
        name = product_name(tx.description)
        key = (tx.account_id, name.lower())
        p = products.get(key)
        if p is None:
            p = products[key] = InvestmentProduct(
                name=name,
                account_id=tx.account_id,
                account_name=account_name,
                currency=tx.currency,
                put_in=ZERO,
                taken_out=ZERO,
                net=ZERO,
                month_net=ZERO,
                last_date=tx.date,
            )
        put_in = -tx.amount if tx.amount < 0 else ZERO
        taken_out = tx.amount if tx.amount > 0 else ZERO
        p.put_in += put_in
        p.taken_out += taken_out
        p.net += put_in - taken_out
        if lo <= tx.date <= hi:
            p.month_net += put_in - taken_out
            movements.append(to_out(tx, account_name, category_name))
        tx_month = month_of(tx.date)
        if first_month <= tx_month <= month:
            h = history[(tx_month, tx.currency)]
            h[0] += put_in
            h[1] += taken_out

    currencies = sorted({c for _, c in history}, key=lambda c: c.value)
    return InvestmentOverview(
        month=month,
        products=sorted(products.values(), key=lambda p: (p.currency.value, -p.net, p.name)),
        history=[
            InvestmentMonth(
                month=m,
                currency=c,
                put_in=history[(m, c)][0],
                taken_out=history[(m, c)][1],
                net=history[(m, c)][0] - history[(m, c)][1],
            )
            for c in currencies
            for m in (shift(month, d) for d in range(-(HISTORY_MONTHS - 1), 1))
        ],
        movements=movements,
    )


async def transfers(db: AsyncSession, family_id: uuid.UUID, month: str) -> TransferOverview:
    lo, hi = month_range(month)
    pending = [
        to_out(tx, a, c)
        for tx, a, c in await _with_names(db, family_id, Transaction.kind == TxKind.PENDING)
    ]
    rows = await _with_names(
        db, family_id, Transaction.kind == TxKind.TRANSFER, Transaction.date.between(lo, hi)
    )
    banks: dict[uuid.UUID, str] = {
        account_id: bank
        for account_id, bank in await db.execute(
            select(Account.id, Account.bank).where(Account.family_id == family_id)
        )
    }
    pair_ids = [tx.transfer_pair_id for tx, _, _ in rows if tx.transfer_pair_id]
    pair_accounts: dict[uuid.UUID, str] = {}
    if pair_ids:
        pair_accounts = {
            tx_id: name
            for tx_id, name in await db.execute(
                select(Transaction.id, Account.name)
                .join(Account, Account.id == Transaction.account_id)
                .where(Transaction.id.in_(pair_ids))
            )
        }

    confirmed: list[TransferOut] = []
    done: set[uuid.UUID] = set()
    singles: list[tuple[Transaction, str]] = []
    for tx, account_name, _ in rows:
        if tx.id in done:
            continue
        if tx.transfer_pair_id and tx.transfer_pair_id in pair_accounts:
            done.update({tx.id, tx.transfer_pair_id})
            other = pair_accounts[tx.transfer_pair_id]
            leaving = tx.amount < 0
            confirmed.append(
                TransferOut(
                    id=tx.id,
                    date=tx.date,
                    description=tx.description,
                    from_account=account_name if leaving else other,
                    to_account=other if leaving else account_name,
                    amount=abs(tx.amount),
                    currency=tx.currency,
                    kind="pair",
                )
            )
        else:
            singles.append((tx, account_name))

    # A conversion shows as money leaving one currency and arriving in another, same day,
    # same bank (Wise, Revolut).
    used: set[uuid.UUID] = set()
    for tx, account_name in singles:
        if tx.id in used or tx.amount >= 0:
            continue
        match = next(
            (
                (o, name)
                for o, name in singles
                if o.id not in used
                and o.amount > 0
                and o.date == tx.date
                and o.currency != tx.currency
                and banks.get(o.account_id) == banks.get(tx.account_id)
            ),
            None,
        )
        if match:
            o, other_name = match
            used.update({tx.id, o.id})
            confirmed.append(
                TransferOut(
                    id=tx.id,
                    date=tx.date,
                    description=tx.description,
                    from_account=account_name,
                    to_account=other_name,
                    amount=-tx.amount,
                    currency=tx.currency,
                    to_amount=o.amount,
                    to_currency=o.currency,
                    kind="exchange",
                )
            )
    for tx, account_name in singles:
        if tx.id in used:
            continue
        leaving = tx.amount < 0
        confirmed.append(
            TransferOut(
                id=tx.id,
                date=tx.date,
                description=tx.description,
                from_account=account_name if leaving else None,
                to_account=None if leaving else account_name,
                amount=abs(tx.amount),
                currency=tx.currency,
                kind="single",
            )
        )
    confirmed.sort(key=lambda t: (t.date, str(t.id)), reverse=True)
    return TransferOverview(month=month, pending=pending, confirmed=confirmed)
