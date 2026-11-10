"""Análises: how spending moves over months, habits, weekdays, peaks and recurring charges.

Only regular lines going out count (investments and own transfers are not spending).
Values stay in each account's own currency, one analysis per currency, like Início.
"""

import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.categories.models import Category
from app.categories.services.categorize import merchant_key, merchant_part
from app.families.models import Currency
from app.transactions.models import Transaction, TxKind
from app.transactions.schemas import (
    Analysis,
    CategoryChange,
    CurrencyAnalysis,
    Habit,
    MonthSpending,
    PeakDay,
    Recurring,
)
from app.transactions.services.months import month_of, month_range, shift
from app.transactions.services.overview_service import OTHER_CATEGORY, _currencies

ZERO = Decimal("0")
PLACES = Decimal("0.0001")
# Rent and bills land on the same days every month: they would hide the daily rhythm.
HOUSING = "Moradia"
SUBSCRIPTIONS = "Assinaturas"
TOP = 6
HABIT_MIN = 3
PEAKS = 3
# Recurring charges are looked for in the chosen month and the three before it.
RECURRING_MONTHS = 4
# A charge that is not a known subscription repeats when it shows up once a month, in at
# least three months, with amounts close to each other.
RECURRING_MIN_MONTHS = 3
RECURRING_SPREAD = Decimal("0.15")


@dataclass(frozen=True)
class Spend:
    currency: Currency
    date: date
    # Positive: money that left.
    amount: Decimal
    description: str
    category: str | None


def display_name(description: str) -> str:
    """'Compra no débito - MERCADONA 2610' → 'Mercadona'."""
    tokens = merchant_part(description).split()
    while len(tokens) > 1 and any(ch.isdigit() for ch in tokens[-1]):
        tokens.pop()
    text = " ".join(tokens)
    if not text.isupper():
        return text
    # Not str.title(): that would turn "NETFLIX.COM" into "Netflix.Com".
    return " ".join(w[:1] + w[1:].lower() for w in tokens)


def _q(value: Decimal) -> Decimal:
    return value.quantize(PLACES)


def _main_category(rows: list[Spend]) -> str | None:
    named = Counter(r.category for r in rows if r.category)
    return named.most_common(1)[0][0] if named else None


def _by_merchant(rows: list[Spend]) -> dict[str, list[Spend]]:
    groups: dict[str, list[Spend]] = defaultdict(list)
    for r in rows:
        if key := merchant_key(r.description):
            groups[key].append(r)
    return groups


def _name(rows: list[Spend]) -> str:
    return display_name(max(rows, key=lambda r: r.date).description)


def analyse(
    rows: list[Spend], currencies: list[Currency], month: str, months: int, today: date
) -> list[CurrencyAnalysis]:
    window = [shift(month, i - (months - 1)) for i in range(months)]
    by_currency: dict[Currency, list[Spend]] = defaultdict(list)
    for r in rows:
        by_currency[r.currency].append(r)
    return [_analyse_currency(c, by_currency[c], month, window, today) for c in currencies]


def _analyse_currency(
    currency: Currency, rows: list[Spend], month: str, window: list[str], today: date
) -> CurrencyAnalysis:
    lo, hi = month_range(month)
    in_window = [r for r in rows if window[0] <= month_of(r.date) <= month]
    in_month = [r for r in rows if lo <= r.date <= hi]

    totals = dict.fromkeys(window, ZERO)
    for r in in_window:
        totals[month_of(r.date)] += r.amount
    # Months before the first imported line are not "zero spending": leave them out.
    with_data = [m for m in window if totals[m] > 0]
    base = [m for m in window[:-1] if with_data and m >= with_data[0]]
    average = _q(sum((totals[m] for m in base), ZERO) / len(base)) if base else None
    recurring = _recurring(rows, month)

    return CurrencyAnalysis(
        currency=currency,
        months=[MonthSpending(month=m, amount=totals[m]) for m in window],
        average=average,
        changes=_changes(in_window, in_month, base),
        habits=_habits(rows, in_month, month),
        weekdays=_weekdays(in_window, min(hi, today)),
        peaks=_peaks(in_month),
        recurring=recurring,
        recurring_total=sum((r.amount for r in recurring), ZERO),
    )


def _changes(
    in_window: list[Spend], in_month: list[Spend], base: list[str]
) -> list[CategoryChange]:
    if not base:
        return []
    now: dict[str, Decimal] = defaultdict(lambda: ZERO)
    before: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for r in in_month:
        now[r.category or OTHER_CATEGORY] += r.amount
    for r in in_window:
        if month_of(r.date) in base:
            before[r.category or OTHER_CATEGORY] += r.amount
    changes = [
        CategoryChange(name=name, amount=now[name], average=_q(before[name] / len(base)))
        for name in set(now) | set(before)
    ]
    changes.sort(key=lambda c: (-abs(c.amount - c.average), c.name))
    return changes[:TOP]


def _habits(rows: list[Spend], in_month: list[Spend], month: str) -> list[Habit]:
    previous = _by_merchant([r for r in rows if month_of(r.date) == shift(month, -1)])
    habits = [
        Habit(
            name=_name(group),
            category=_main_category(group),
            count=len(group),
            previous_count=len(previous.get(key, [])),
            total=sum((r.amount for r in group), ZERO),
        )
        for key, group in _by_merchant(in_month).items()
        if len(group) >= HABIT_MIN
    ]
    habits.sort(key=lambda h: (-h.count, -h.total, h.name))
    return habits[:TOP]


def _weekdays(in_window: list[Spend], end: date) -> list[Decimal]:
    if not in_window:
        return [ZERO] * 7
    start = min(r.date for r in in_window)
    sums = [ZERO] * 7
    for r in in_window:
        if r.category != HOUSING and r.date <= end:
            sums[r.date.weekday()] += r.amount
    days = [0] * 7
    day = start
    while day <= end:
        days[day.weekday()] += 1
        day += timedelta(days=1)
    return [_q(s / n) if n else ZERO for s, n in zip(sums, days, strict=True)]


def _peaks(in_month: list[Spend]) -> list[PeakDay]:
    by_day: dict[date, list[Spend]] = defaultdict(list)
    for r in in_month:
        if r.category != HOUSING:
            by_day[r.date].append(r)
    peaks = []
    for day, group in by_day.items():
        where: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for r in group:
            where[display_name(r.description)] += r.amount
        top = sorted(where.items(), key=lambda kv: (-kv[1], kv[0]))[:2]
        peaks.append(
            PeakDay(
                date=day,
                amount=sum((r.amount for r in group), ZERO),
                merchants=[name for name, _ in top],
            )
        )
    peaks.sort(key=lambda p: (-p.amount, p.date))
    return peaks[:PEAKS]


def _recurring(rows: list[Spend], month: str) -> list[Recurring]:
    first = shift(month, -(RECURRING_MONTHS - 1))
    recent = {month, shift(month, -1)}
    found = []
    for group in _by_merchant([r for r in rows if first <= month_of(r.date) <= month]).values():
        per_month: dict[str, list[Spend]] = defaultdict(list)
        for r in group:
            per_month[month_of(r.date)].append(r)
        last_month = max(per_month)
        if last_month not in recent:
            continue  # stopped: no charge this month or the one before
        category = _main_category(group)
        if category == SUBSCRIPTIONS:
            # Known subscriptions: twice is enough, and one store (Apple) may bill several.
            if len(per_month) < 2:
                continue
        elif len(per_month) < RECURRING_MIN_MONTHS or not _steady(per_month):
            continue
        last = per_month[last_month]
        found.append(
            Recurring(
                name=_name(group),
                category=category,
                amount=sum((r.amount for r in last), ZERO),
                last_date=max(r.date for r in last),
                months=len(per_month),
            )
        )
    found.sort(key=lambda f: (-f.amount, f.name))
    return found


def _steady(per_month: dict[str, list[Spend]]) -> bool:
    if any(len(charges) != 1 for charges in per_month.values()):
        return False
    amounts = sorted(charges[0].amount for charges in per_month.values())
    middle = amounts[len(amounts) // 2]
    return all(abs(a - middle) <= middle * RECURRING_SPREAD for a in amounts)


async def analysis(
    db: AsyncSession, family_id: uuid.UUID, month: str, months: int, today: date | None = None
) -> Analysis:
    first = min(shift(month, -(months - 1)), shift(month, -(RECURRING_MONTHS - 1)))
    lo, _ = month_range(first)
    _, hi = month_range(month)
    result = await db.execute(
        select(
            Transaction.currency,
            Transaction.date,
            Transaction.amount,
            Transaction.description,
            Category.name,
        )
        .outerjoin(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.family_id == family_id,
            Transaction.kind == TxKind.REGULAR,
            Transaction.amount < 0,
            Transaction.date.between(lo, hi),
        )
    )
    rows = [Spend(c, d, -a, desc, cat) for c, d, a, desc, cat in result]
    currencies = await _currencies(db, family_id)
    return Analysis(
        month=month,
        months=months,
        currencies=analyse(rows, currencies, month, months, today or date.today()),
    )
