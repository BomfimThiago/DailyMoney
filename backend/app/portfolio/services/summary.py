"""The portfolio for the screen, from positions already converted to one currency: grouped
by class, with each class's share, the gain over what was put in (only where the bank
says how much was put in: fixed income and Tesouro), what matures soon and in which year.
All in Decimal."""

from calendar import monthrange
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

ZERO = Decimal(0)
CENTS = Decimal("0.01")
FRACTION = Decimal("0.0001")

CLASS_LABEL = {
    "fixed": "Renda fixa",
    "treasury": "Tesouro Direto",
    "stocks": "Ações",
    "real_estate": "Fundos imobiliários",
    "etf": "ETFs",
    "funds": "Fundos",
    "pension": "Previdência",
    "other": "Outros",
}


def investment_class(type_: str, subtype: str | None) -> str:
    if type_ == "FIXED_INCOME":
        return "treasury" if subtype == "TREASURY" else "fixed"
    if type_ == "EQUITY":
        return "real_estate" if subtype == "REAL_ESTATE_FUND" else "stocks"
    if type_ == "ETF" or subtype == "ETF_FUND":
        return "etf"
    if type_ == "MUTUAL_FUND":
        return "funds"
    if type_ == "SECURITY":
        return "pension"
    return "other"


@dataclass
class Held:
    """One open position, with its balance and amount put in already in the lens."""

    key: object
    bank: str
    type: str
    subtype: str | None
    value: Decimal
    # In the lens, by the same rate as the balance; None when the bank doesn't say.
    invested: Decimal | None
    due_date: date | None

    @property
    def gain(self) -> Decimal | None:
        return None if self.invested is None else self.value - self.invested


def invested_in_lens(
    balance: Decimal, value: Decimal, amount_original: Decimal | None
) -> Decimal | None:
    """What was put in, taken to the lens by the balance's own rate (value / balance)."""
    if amount_original is None or balance == 0:
        return None
    return (amount_original * value / balance).quantize(CENTS)


def share(part: Decimal, total: Decimal) -> Decimal:
    return ZERO if total == 0 else (part / total).quantize(FRACTION)


@dataclass
class ClassGroup:
    key: str
    label: str
    total: Decimal
    share: Decimal
    items: list[Held]


def by_class(held: list[Held]) -> list[ClassGroup]:
    total = sum((h.value for h in held), ZERO)
    groups: dict[str, list[Held]] = {}
    for h in held:
        groups.setdefault(investment_class(h.type, h.subtype), []).append(h)
    out = []
    for key, items in groups.items():
        part = sum((h.value for h in items), ZERO)
        out.append(
            ClassGroup(
                key=key,
                label=CLASS_LABEL[key],
                total=part,
                share=share(part, total),
                items=sorted(items, key=lambda h: -h.value),
            )
        )
    return sorted(out, key=lambda g: -g.total)


@dataclass
class Tracked:
    invested: Decimal
    value: Decimal
    gain: Decimal
    # Percent with one decimal place; None when nothing was put in.
    gain_pct: Decimal | None


def tracked(held: list[Held]) -> Tracked | None:
    known = [h for h in held if h.invested is not None]
    if not known:
        return None
    invested = sum((h.invested or ZERO for h in known), ZERO)
    value = sum((h.value for h in known), ZERO)
    gain = value - invested
    pct = None if invested == 0 else (gain / invested * 100).quantize(Decimal("0.1"))
    return Tracked(invested=invested, value=value, gain=gain, gain_pct=pct)


def by_bank(held: list[Held]) -> list[tuple[str, Decimal]]:
    sums: dict[str, Decimal] = {}
    for h in held:
        sums[h.bank] = sums.get(h.bank, ZERO) + h.value
    return sorted(sums.items(), key=lambda kv: (-kv[1], kv[0]))


def add_months(day: date, months: int) -> date:
    m = day.month - 1 + months
    year, month = day.year + m // 12, m % 12 + 1
    # The 31st of a short month becomes its last day.
    return date(year, month, min(day.day, monthrange(year, month)[1]))


def maturing(held: list[Held], today: date, months: int = 12) -> tuple[int, Decimal]:
    """What matures from today until `months` months later: how many and their value today."""
    until = add_months(today, months)
    due = [h for h in held if h.due_date and today <= h.due_date < until]
    return len(due), sum((h.value for h in due), ZERO)


@dataclass
class Step:
    # "2027", or "2034+" on the last step when the years don't fit.
    label: str
    year: int
    total: Decimal
    count: int


@dataclass
class Ladder:
    steps: list[Step]
    dated_total: Decimal
    dated_count: int
    # Shares, funds, daily liquidity...: no date to come back.
    undated_total: Decimal
    undated_count: int


def _by_year(held: list[Held], first: int) -> dict[int, tuple[Decimal, int]]:
    """Value and count maturing each year; a past due date counts in the first year."""
    by_year: dict[int, tuple[Decimal, int]] = {}
    for h in held:
        if h.due_date is not None:
            y = max(first, h.due_date.year)
            total, count = by_year.get(y, (ZERO, 0))
            by_year[y] = (total + h.value, count + 1)
    return by_year


def _step(by_year: dict[int, tuple[Decimal, int]], y: int, cap: int, last: int) -> Step:
    years = [yy for yy in by_year if yy == y or (y == cap and yy > cap)]
    return Step(
        label=f"{y}+" if y == cap and last > cap else str(y),
        year=y,
        total=sum((by_year[yy][0] for yy in years), ZERO),
        count=sum(by_year[yy][1] for yy in years),
    )


def maturity_ladder(held: list[Held], today: date, max_years: int = 8) -> Ladder | None:
    """How much of the portfolio (by today's value) matures each year, from this year to
    the last due date. Years with nothing in between stay at zero (the gap is
    information); past `max_years` steps, the rest joins the last one ("2034+"). A due
    date already past that still shows open counts in this year. None with no due date."""
    first = today.year
    by_year = _by_year(held, first)
    if not by_year:
        return None
    last = max(by_year)
    cap = min(last, first + max_years - 1)
    steps = [_step(by_year, y, cap, last) for y in range(first, cap + 1)]
    undated = [h for h in held if h.due_date is None]
    return Ladder(
        steps=steps,
        dated_total=sum((s.total for s in steps), ZERO),
        dated_count=sum(s.count for s in steps),
        undated_total=sum((h.value for h in undated), ZERO),
        undated_count=len(undated),
    )


def _pct(d: Decimal) -> str:
    text = f"{d.normalize():f}" if d == d.to_integral() else f"{d.quantize(CENTS).normalize():f}"
    return text.replace(".", ",")


def rate_label(
    rate: Decimal | None, rate_type: str | None, fixed_annual_rate: Decimal | None
) -> str | None:
    """The agreed return in words: "100% do CDI", "IPCA + 6,5% a.a.", "12% a.a."."""
    fixed = fixed_annual_rate if fixed_annual_rate else None
    plus = f" + {_pct(fixed)}% a.a." if fixed else ""
    if rate_type and rate is not None:
        index = {"DOLAR": "dólar", "EURO": "euro", "SELIC": "Selic"}.get(rate_type, rate_type)
        # An inflation index reads "IPCA + 6%"; an interest one, "110% do CDI".
        if rate_type in ("IPCA", "IGPM") and rate == 100:
            return f"{index}{plus}"
        of = "da" if rate_type == "SELIC" else "do"
        return f"{_pct(rate)}% {of} {index}{plus}"
    return f"{_pct(fixed)}% a.a." if fixed else None


def history_points(
    snapshots: Sequence[Sequence[tuple[date, Decimal]]], since: date
) -> list[tuple[date, Decimal]]:
    """The portfolio's total on every day some balance was read, from `since` on. Each
    investment counts with its last balance read on or before that day (balances come
    with different days); one that was withdrawn has a zero balance from then on."""
    days = sorted({d for points in snapshots for d, _ in points if d >= since})
    out = []
    for day in days:
        total = ZERO
        for points in snapshots:
            last = None
            for d, value in points:  # sorted by day
                if d > day:
                    break
                last = value
            if last is not None:
                total += last
        out.append((day, total))
    return out
