"""Month summary, investments and transfers (spec: Início, Investimentos, Transferências).

Values stay in each account's own currency (one summary per currency), unless a currency
is chosen: then every line is converted with its day's European Central Bank rate and
there is one summary, in that currency.
"""

import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.categories.models import Category
from app.families.models import Currency, Family, Member
from app.families.services.family_service import month_start_day
from app.fx.services.fx_service import converter
from app.statements.parsing.own_moves import product_name
from app.transactions.models import APPROVED, ReviewStatus, Transaction, TxKind
from app.transactions.schemas import (
    CurrencyDashboard,
    CurrencySummary,
    InvestmentMonth,
    InvestmentOverview,
    InvestmentProduct,
    InvestmentTotal,
    MonthDashboard,
    MonthSummary,
    SpendingShare,
    TransactionOut,
    TransferOut,
    TransferOverview,
)
from app.transactions.services.flow import Flow
from app.transactions.services.months import month_of, month_range, shift
from app.transactions.services.transaction_service import HOUSEHOLD as HOUSEHOLD_KEY
from app.transactions.services.transaction_service import NO_CATEGORY, NO_CATEGORY_KEY, to_out

ZERO = Decimal("0")
HISTORY_MONTHS = 6
# The kinds that count as spending and income. Only money moving between the family's own
# accounts (and what still waits to be confirmed) stays out.
COUNTED = (TxKind.REGULAR, TxKind.INVESTMENT)


async def _currencies(
    db: AsyncSession, family_id: uuid.UUID, target: Currency | None = None
) -> list[Currency]:
    family = await db.get(Family, family_id)
    used = set(
        await db.scalars(select(Account.currency).where(Account.family_id == family_id).distinct())
    )
    if target is not None:
        return [target] if used else []
    first = family.display_currency if family else Currency.BRL
    return sorted(used, key=lambda c: (c != first, c.value))


async def month_summary(
    db: AsyncSession, family_id: uuid.UUID, month: str, currency: Currency | None = None
) -> MonthSummary:
    lo, hi = month_range(month, await month_start_day(db, family_id))
    conv = await converter(db, currency, lo, hi)
    rows = await db.execute(
        select(Transaction.currency, Transaction.kind, Transaction.amount, Transaction.date).where(
            Transaction.family_id == family_id,
            APPROVED,
            Transaction.date.between(lo, hi),
            Transaction.kind.in_(COUNTED),
        )
    )
    flows: dict[Currency, Flow] = defaultdict(Flow)
    for original, kind, raw, day in rows:
        # An investment move counts by its net: put in beyond what came back is spending,
        # the other way round is income (category Investimento).
        flows[conv.currency(original)].add(conv(raw, original, day), kind == TxKind.INVESTMENT)

    out = []
    for shown in await _currencies(db, family_id, currency):
        f = flows[shown]
        out.append(
            CurrencySummary(
                currency=shown,
                income=f.total_income,
                spending=f.total_spending,
                invested=f.invested,
                invested_in=f.put_in,
                invested_out=f.taken_out,
                left=f.total_income - f.total_spending,
            )
        )
    pending = await _count(db, family_id, APPROVED, Transaction.kind == TxKind.PENDING)
    to_review = await _count(db, family_id, Transaction.review == ReviewStatus.PENDING)
    return MonthSummary(month=month, currencies=out, pending_transfers=pending, to_review=to_review)


async def _count(db: AsyncSession, family_id: uuid.UUID, *where: object) -> int:
    count = await db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(Transaction.family_id == family_id, *where)  # type: ignore[arg-type]
    )
    return count or 0


OTHER_CATEGORY = "Outros"
HOUSEHOLD = "Casa"

# A group of spending: the value Transações filters it by, and the name shown.
_Group = tuple[str, str]
_Flows = dict[Currency, dict[_Group, Flow]]


def _groups() -> _Flows:
    return defaultdict(lambda: defaultdict(Flow))


def _shares(flows: dict[_Group, Flow], income: bool = False) -> list[SpendingShare]:
    sums = {g: (f.total_income if income else f.total_spending) for g, f in flows.items()}
    return [
        SpendingShare(key=key, name=name, amount=amount)
        for (key, name), amount in sorted(sums.items(), key=lambda kv: (-kv[1], kv[0][1]))
        if amount > 0
    ]


def _days(n: int) -> list[Flow]:
    return [Flow() for _ in range(n)]


_CASA: _Group = (HOUSEHOLD_KEY, HOUSEHOLD)


def _category(category_id: uuid.UUID | None, name: str | None) -> _Group:
    if category_id is None or name is None:
        return (NO_CATEGORY_KEY, NO_CATEGORY)
    return (str(category_id), name)


async def month_dashboard(
    db: AsyncSession, family_id: uuid.UUID, month: str, currency: Currency | None = None
) -> MonthDashboard:
    """Spending per day (this month and the one before); spending by category, account,
    person and bank; income by category; and the month before's totals."""
    start_day = await month_start_day(db, family_id)
    lo, hi = month_range(month, start_day)
    prev_lo, prev_hi = month_range(shift(month, -1), start_day)
    conv = await converter(db, currency, prev_lo, hi)
    rows = await db.execute(
        select(
            Transaction.currency,
            Transaction.date,
            Transaction.amount,
            Transaction.kind,
            Account.id,
            Account.name,
            Account.bank,
            Transaction.category_id,
            Category.name,
            Transaction.member_id,
            Member.name,
        )
        .join(Account, Account.id == Transaction.account_id)
        .outerjoin(Category, Category.id == Transaction.category_id)
        # The line's own Responsável, the same one Transações filters by (none = Casa).
        .outerjoin(Member, Member.id == Transaction.member_id)
        .where(
            Transaction.family_id == family_id,
            APPROVED,
            Transaction.kind.in_(COUNTED),
            Transaction.date.between(prev_lo, hi),
        )
    )
    # Index 0 is the period's first day (not always the 1st). Investment moves are netted
    # per group for the month, and per day for the daily rhythm.
    daily: dict[Currency, list[Flow]] = defaultdict(lambda: _days((hi - lo).days + 1))
    previous: dict[Currency, list[Flow]] = defaultdict(lambda: _days((prev_hi - prev_lo).days + 1))
    before: dict[Currency, Flow] = defaultdict(Flow)
    by_category, by_account, by_person, by_bank = (_groups() for _ in range(4))
    for row in rows:
        (original, day, raw, kind, account_id, account_name, bank) = row[:7]
        category_id, category, member_id, person = row[7:]
        currency = conv.currency(original)
        amount = conv(raw, original, day)
        investment = kind == TxKind.INVESTMENT
        if day < lo:
            before[currency].add(amount, investment)
            previous[currency][(day - prev_lo).days].add(amount, investment)
            continue
        daily[currency][(day - lo).days].add(amount, investment)
        by_category[currency][_category(category_id, category)].add(amount, investment)
        by_account[currency][(str(account_id), account_name)].add(amount, investment)
        person_key = (str(member_id), person) if member_id else _CASA
        by_person[currency][person_key].add(amount, investment)
        by_bank[currency][(bank, bank)].add(amount, investment)

    return MonthDashboard(
        month=month,
        start=lo,
        end=hi,
        currencies=[
            CurrencyDashboard(
                currency=c,
                daily=[f.total_spending for f in daily[c]],
                previous_daily=[f.total_spending for f in previous[c]],
                categories=_shares(by_category[c]),
                accounts=_shares(by_account[c]),
                people=_shares(by_person[c]),
                banks=_shares(by_bank[c]),
                income_categories=_shares(by_category[c], income=True),
                previous_income=before[c].total_income,
                previous_spending=before[c].total_spending,
            )
            for c in await _currencies(db, family_id, currency)
        ],
    )


async def _with_names(
    db: AsyncSession, family_id: uuid.UUID, *where: object
) -> list[tuple[Transaction, str, str | None]]:
    rows = await db.execute(
        select(Transaction, Account.name, Category.name)
        .join(Account, Account.id == Transaction.account_id)
        .outerjoin(Category, Category.id == Transaction.category_id)
        .where(Transaction.family_id == family_id, APPROVED, *where)  # type: ignore[arg-type]
        .order_by(Transaction.date.desc(), Transaction.created_at.desc(), Transaction.id)
    )
    return [(tx, account_name, category_name) for tx, account_name, category_name in rows]


async def investments(
    db: AsyncSession, family_id: uuid.UUID, month: str, currency: Currency | None = None
) -> InvestmentOverview:
    start_day = await month_start_day(db, family_id)
    lo, hi = month_range(month, start_day)
    rows = await _with_names(db, family_id, Transaction.kind == TxKind.INVESTMENT)
    dates = [tx.date for tx, _, _ in rows]
    conv = await converter(db, currency, min(dates, default=None), max(dates, default=None))

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
                currency=conv.currency(tx.currency),
                put_in=ZERO,
                taken_out=ZERO,
                net=ZERO,
                month_net=ZERO,
                last_date=tx.date,
            )
        amount = conv(tx.amount, tx.currency, tx.date)
        put_in = -amount if amount < 0 else ZERO
        taken_out = amount if amount > 0 else ZERO
        p.put_in += put_in
        p.taken_out += taken_out
        p.net += put_in - taken_out
        if lo <= tx.date <= hi:
            p.month_net += put_in - taken_out
            movements.append(to_out(tx, account_name, category_name, conv))
        tx_month = month_of(tx.date, start_day)
        if first_month <= tx_month <= month:
            h = history[(tx_month, conv.currency(tx.currency))]
            h[0] += put_in
            h[1] += taken_out

    currencies = sorted({c for _, c in history}, key=lambda c: c.value)
    totals: dict[Currency, InvestmentTotal] = {}
    for p in products.values():
        t = totals.setdefault(
            p.currency,
            InvestmentTotal(currency=p.currency, put_in=ZERO, taken_out=ZERO, net=ZERO),
        )
        t.put_in += p.put_in
        t.taken_out += p.taken_out
        t.net += p.net
    return InvestmentOverview(
        month=month,
        totals=sorted(totals.values(), key=lambda t: t.currency.value),
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
    lo, hi = month_range(month, await month_start_day(db, family_id))
    pending = [
        to_out(tx, a, c)
        for tx, a, c in await _with_names(db, family_id, Transaction.kind == TxKind.PENDING)
    ]
    rows = [
        (tx, account_name)
        for tx, account_name, _ in await _with_names(
            db, family_id, Transaction.kind == TxKind.TRANSFER, Transaction.date.between(lo, hi)
        )
    ]
    pairs, singles = _pairs(rows, await _pair_account_names(db, rows))
    exchanges, singles = _exchanges(singles, await _bank_by_account(db, family_id))
    confirmed = [*pairs, *exchanges, *(_single(tx, name) for tx, name in singles)]
    confirmed.sort(key=lambda t: (t.date, str(t.id)), reverse=True)
    return TransferOverview(month=month, pending=pending, confirmed=confirmed)


_Named = tuple[Transaction, str]


async def _bank_by_account(db: AsyncSession, family_id: uuid.UUID) -> dict[uuid.UUID, str]:
    rows = await db.execute(select(Account.id, Account.bank).where(Account.family_id == family_id))
    return {account_id: bank for account_id, bank in rows}


async def _pair_account_names(db: AsyncSession, rows: list[_Named]) -> dict[uuid.UUID, str]:
    """For each paired transaction's other side: the name of its account."""
    pair_ids = [tx.transfer_pair_id for tx, _ in rows if tx.transfer_pair_id]
    if not pair_ids:
        return {}
    found = await db.execute(
        select(Transaction.id, Account.name)
        .join(Account, Account.id == Transaction.account_id)
        .where(Transaction.id.in_(pair_ids))
    )
    return {tx_id: name for tx_id, name in found}


def _pairs(
    rows: list[_Named], pair_accounts: dict[uuid.UUID, str]
) -> tuple[list[TransferOut], list[_Named]]:
    """Paired transfers shown once (from the side seen first); the rest are singles."""
    pairs: list[TransferOut] = []
    singles: list[_Named] = []
    done: set[uuid.UUID] = set()
    for tx, account_name in rows:
        other = pair_accounts.get(tx.transfer_pair_id) if tx.transfer_pair_id else None
        if tx.id in done:
            continue
        if other is None:
            singles.append((tx, account_name))
            continue
        done.update({tx.id, tx.transfer_pair_id} if tx.transfer_pair_id else {tx.id})
        leaving = tx.amount < 0
        pairs.append(
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
    return pairs, singles


def _exchanges(
    singles: list[_Named], banks: dict[uuid.UUID, str]
) -> tuple[list[TransferOut], list[_Named]]:
    """A conversion shows as money leaving one currency and arriving in another, same day,
    same bank (Wise, Revolut). Returns the conversions and the singles left over."""
    exchanges: list[TransferOut] = []
    used: set[uuid.UUID] = set()
    for tx, account_name in singles:
        if tx.id in used or tx.amount >= 0:
            continue
        match = next(
            ((o, name) for o, name in singles if o.id not in used and _converts(tx, o, banks)),
            None,
        )
        if match is None:
            continue
        o, other_name = match
        used.update({tx.id, o.id})
        exchanges.append(
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
    return exchanges, [(tx, name) for tx, name in singles if tx.id not in used]


def _converts(out: Transaction, arrival: Transaction, banks: dict[uuid.UUID, str]) -> bool:
    return (
        arrival.amount > 0
        and arrival.date == out.date
        and arrival.currency != out.currency
        and banks.get(arrival.account_id) == banks.get(out.account_id)
    )


def _single(tx: Transaction, account_name: str) -> TransferOut:
    leaving = tx.amount < 0
    return TransferOut(
        id=tx.id,
        date=tx.date,
        description=tx.description,
        from_account=account_name if leaving else None,
        to_account=None if leaving else account_name,
        amount=abs(tx.amount),
        currency=tx.currency,
        kind="single",
    )
