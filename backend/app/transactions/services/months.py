import calendar
import re
from datetime import date

from app.core.exceptions import AppError

_MONTH = re.compile(r"^(\d{4})-(\d{2})$")


class MonthError(AppError):
    status_code = 422
    code = "INVALID_MONTH"


def month_range(month: str) -> tuple[date, date]:
    """'2026-10' → first and last day of October 2026."""
    m = _MONTH.match(month)
    if not m or not 1 <= int(m.group(2)) <= 12:
        raise MonthError("Mês inválido: use o formato AAAA-MM")
    year, mon = int(m.group(1)), int(m.group(2))
    return date(year, mon, 1), date(year, mon, calendar.monthrange(year, mon)[1])


def shift(month: str, delta: int) -> str:
    """'2026-01' shifted by -1 → '2025-12'."""
    lo, _ = month_range(month)
    index = lo.year * 12 + lo.month - 1 + delta
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def month_of(day: date) -> str:
    return f"{day.year:04d}-{day.month:02d}"
