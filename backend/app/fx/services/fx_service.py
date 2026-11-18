"""Converting amounts between BRL, USD and EUR with the ECB rate of each line's day.

Rates are fetched once and kept in ``fx_rate``; a line is converted with the rate of its
own date (the last one published on or before it), like the old app did.
"""

import logging
from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

import httpx
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.families.models import Currency
from app.fx.models import FxRate
from app.fx.services import frankfurter

log = logging.getLogger(__name__)

PLACES = Decimal("0.0001")
# Exchange rates are shown with 8 places, like interest rates.
RATE_PLACES = Decimal("0.00000001")
# The ECB publishes every business day: a week back always reaches a published rate.
LOOKBACK = timedelta(days=7)
ONE_DAY = timedelta(days=1)
# Rows per INSERT, well under Postgres' limit of parameters per statement.
CHUNK = 1000


class FxUnavailableError(AppError):
    status_code = 503
    code = "FX_UNAVAILABLE"


@dataclass
class Converter:
    """Turns an amount in any currency into the target one, with the rate of its day.

    With no target, amounts stay as they are (one figure per currency).
    """

    target: Currency | None = None
    days: list[date] = field(default_factory=list)
    rates: list[dict[Currency, Decimal]] = field(default_factory=list)

    def _index(self, on: date) -> int:
        return max(bisect_right(self.days, on) - 1, 0)

    def rate_day(self, on: date) -> date | None:
        """The day whose published rate converts a line dated `on`."""
        return self.days[self._index(on)] if self.target and self.days else None

    def rate(self, currency: Currency, on: date) -> Decimal:
        """How much of the target one unit of `currency` was worth on that day."""
        if self.target is None or currency == self.target:
            return Decimal(1)
        per_eur = self.rates[self._index(on)]
        return (_per_eur(per_eur, self.target) / _per_eur(per_eur, currency)).quantize(RATE_PLACES)

    def currency(self, original: Currency) -> Currency:
        return self.target or original

    def __call__(self, amount: Decimal, currency: Currency, on: date) -> Decimal:
        if self.target is None or currency == self.target:
            return amount
        per_eur = self.rates[self._index(on)]
        euros = amount / _per_eur(per_eur, currency)
        return (euros * _per_eur(per_eur, self.target)).quantize(PLACES)


def _per_eur(rates: dict[Currency, Decimal], currency: Currency) -> Decimal:
    return Decimal(1) if currency == Currency.EUR else rates[currency]


async def converter(
    db: AsyncSession,
    target: Currency | None,
    lo: date | None,
    hi: date | None,
    today: date | None = None,
) -> Converter:
    """A converter for lines dated between lo and hi (None: there are no lines)."""
    if target is None:
        return Converter()
    if lo is not None and hi is not None:
        await ensure_rates(db, lo, hi, today or date.today())
    query = select(FxRate).order_by(FxRate.date)
    if lo is not None and hi is not None:
        query = query.where(FxRate.date.between(lo - LOOKBACK, hi))
    rows = (await db.execute(query)).scalars().all()
    by_day: dict[date, dict[Currency, Decimal]] = {}
    for row in rows:
        by_day.setdefault(row.date, {})[row.currency] = row.per_eur
    if lo is not None and not by_day:
        raise FxUnavailableError(
            "Não consegui buscar as cotações do Banco Central Europeu. Tente de novo em instantes."
        )
    days = sorted(by_day)
    return Converter(target=target, days=days, rates=[by_day[d] for d in days])


async def ensure_rates(db: AsyncSession, lo: date, hi: date, today: date) -> None:
    """Make sure every day from lo to hi has a rate, fetching the missing ones.

    Today's rate is published in the afternoon: days from today on use yesterday's.
    If the rate service is down, the rates already kept are used for the nearest days.
    """
    end = min(hi, today - ONE_DAY)
    start = min(lo, end)
    have = await db.scalar(
        select(func.count())
        .select_from(FxRate)
        .where(FxRate.currency == frankfurter.QUOTES[0], FxRate.date.between(start, end))
    )
    if (have or 0) >= (end - start).days + 1:
        return
    try:
        fetched = await frankfurter.fetch(start - LOOKBACK, end)
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        log.warning("fx_fetch_failed", extra={"error": type(exc).__name__})
        return
    rows = fill_days(fetched, end)
    if not rows:
        return
    for i in range(0, len(rows), CHUNK):
        stmt = insert(FxRate).values(rows[i : i + CHUNK])
        await db.execute(
            stmt.on_conflict_do_update(
                index_elements=[FxRate.date, FxRate.currency],
                set_={"per_eur": stmt.excluded.per_eur, "rate_date": stmt.excluded.rate_date},
            )
        )
    # Kept even when the request that fetched them fails afterwards.
    await db.commit()


def fill_days(fetched: frankfurter.Rates, end: date) -> list[dict[str, object]]:
    """One row per day and currency from the first published day to end, carrying the last
    published rate over weekends and holidays."""
    if not fetched:
        return []
    rows: list[dict[str, object]] = []
    published = sorted(fetched)
    day, i = published[0], 0
    while day <= end:
        while i + 1 < len(published) and published[i + 1] <= day:
            i += 1
        rate_date = published[i]
        for currency, per_eur in fetched[rate_date].items():
            rows.append(
                {"date": day, "currency": currency, "per_eur": per_eur, "rate_date": rate_date}
            )
        day += ONE_DAY
    return rows
