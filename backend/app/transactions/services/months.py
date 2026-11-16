"""Months of the app: a month may start on a day other than the 1st (the salary day).

The family chooses the day (`Family.month_start_day`, 1–28: a day every month has, so every
period starts on the same day). A period is named after the month holding most of its days:
starting up to the 15th it takes the name of the month it starts in (15 May–14 Jun is May);
from the 16th on, the month it ends in (27 Oct–26 Nov is November). Same rule as the app
(app/src/lib/period.ts) and the old Daily Money.
"""

import re
from datetime import date, timedelta

from app.core.exceptions import AppError

_MONTH = re.compile(r"^(\d{4})-(\d{2})$")

MONTH_START_MIN = 1
MONTH_START_MAX = 28
# From this start day on, a period is named after the month it ends in.
NAMED_BY_END_FROM = 16


class MonthError(AppError):
    status_code = 422
    code = "INVALID_MONTH"


def normalize_start_day(day: int | None) -> int:
    """Anything outside 1–28 means the calendar month."""
    return day if day is not None and MONTH_START_MIN <= day <= MONTH_START_MAX else 1


def _parse(month: str) -> tuple[int, int]:
    m = _MONTH.match(month)
    if not m or not 1 <= int(m.group(2)) <= 12:
        raise MonthError("Mês inválido: use o formato AAAA-MM")
    return int(m.group(1)), int(m.group(2))


def _key(index: int) -> str:
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def shift(month: str, delta: int) -> str:
    """'2026-01' shifted by -1 → '2025-12'."""
    year, mon = _parse(month)
    return _key(year * 12 + mon - 1 + delta)


def _start_offset(start_day: int) -> int:
    """How many months the period starts before the month it is named after (0 or -1)."""
    return -1 if start_day >= NAMED_BY_END_FROM else 0


def month_range(month: str, start_day: int = 1) -> tuple[date, date]:
    """First and last day (inclusive) of the period named `month`.

    '2026-10' → 1–31 Oct with start day 1; 5 Oct–4 Nov with 5; 27 Sep–26 Oct with 27.
    """
    sd = normalize_start_day(start_day)
    year, mon = _parse(shift(month, _start_offset(sd)))
    first = date(year, mon, sd)
    next_year, next_mon = _parse(shift(month, _start_offset(sd) + 1))
    return first, date(next_year, next_mon, sd) - timedelta(days=1)


def month_of(day: date, start_day: int = 1) -> str:
    """The name ('AAAA-MM') of the period a day falls in."""
    sd = normalize_start_day(start_day)
    calendar_month = f"{day.year:04d}-{day.month:02d}"
    starts_in = calendar_month if day.day >= sd else shift(calendar_month, -1)
    return shift(starts_in, -_start_offset(sd))
