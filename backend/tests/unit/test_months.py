from datetime import date

import pytest

from app.transactions.services.months import (
    MonthError,
    month_of,
    month_range,
    normalize_start_day,
    shift,
)


def test_start_day_one_is_the_calendar_month() -> None:
    assert month_range("2026-02") == (date(2026, 2, 1), date(2026, 2, 28))
    assert month_of(date(2026, 2, 28)) == "2026-02"


def test_start_up_to_the_15th_takes_the_name_of_the_month_it_starts_in() -> None:
    assert month_range("2026-05", 15) == (date(2026, 5, 15), date(2026, 6, 14))
    assert month_of(date(2026, 5, 15), 15) == "2026-05"
    assert month_of(date(2026, 6, 14), 15) == "2026-05"
    assert month_of(date(2026, 5, 14), 15) == "2026-04"


def test_start_from_the_16th_takes_the_name_of_the_month_it_ends_in() -> None:
    assert month_range("2026-11", 27) == (date(2026, 10, 27), date(2026, 11, 26))
    assert month_of(date(2026, 10, 27), 27) == "2026-11"
    assert month_of(date(2026, 11, 26), 27) == "2026-11"
    assert month_of(date(2026, 11, 27), 27) == "2026-12"


def test_periods_cross_the_year_and_follow_each_other_without_gaps() -> None:
    assert month_range("2027-01", 20) == (date(2026, 12, 20), date(2027, 1, 19))
    assert month_range("2026-12", 5) == (date(2026, 12, 5), date(2027, 1, 4))
    for sd in (1, 5, 15, 16, 28):
        _, end = month_range("2026-03", sd)
        start, _ = month_range("2026-04", sd)
        assert (start - end).days == 1


def test_every_day_falls_in_the_period_named_after_it() -> None:
    for sd in (1, 10, 16, 28):
        for name in ("2026-01", "2026-02", "2026-12"):
            lo, hi = month_range(name, sd)
            assert month_of(lo, sd) == name
            assert month_of(hi, sd) == name


def test_invalid_start_day_means_calendar_month() -> None:
    assert normalize_start_day(0) == 1
    assert normalize_start_day(29) == 1
    assert normalize_start_day(None) == 1
    assert normalize_start_day(28) == 28


def test_shift_and_invalid_month() -> None:
    assert shift("2026-01", -1) == "2025-12"
    with pytest.raises(MonthError):
        month_range("2026-13")
