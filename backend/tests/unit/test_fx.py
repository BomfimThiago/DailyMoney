from datetime import date
from decimal import Decimal

import httpx
import pytest

from app.families.models import Currency
from app.fx.services import frankfurter
from app.fx.services.fx_service import Converter, fill_days

BRL, USD, EUR = Currency.BRL, Currency.USD, Currency.EUR


def test_without_target_amounts_stay_as_they_are() -> None:
    conv = Converter()
    assert conv.currency(BRL) == BRL
    assert conv(Decimal("-10"), BRL, date(2026, 10, 1)) == Decimal("-10")


def test_converts_through_the_euro_with_the_rate_of_the_day() -> None:
    conv = Converter(
        target=USD,
        days=[date(2026, 10, 1), date(2026, 10, 2)],
        rates=[{BRL: Decimal("6"), USD: Decimal("1.2")}, {BRL: Decimal("5"), USD: Decimal("1")}],
    )
    assert conv.currency(BRL) == USD
    assert conv(Decimal("-600"), BRL, date(2026, 10, 1)) == Decimal("-120.0000")
    # Later days use the last rate known; earlier ones the first.
    assert conv(Decimal("500"), BRL, date(2026, 10, 9)) == Decimal("100.0000")
    assert conv(Decimal("600"), BRL, date(2026, 9, 1)) == Decimal("120.0000")
    assert conv(Decimal("10"), EUR, date(2026, 10, 1)) == Decimal("12.0000")
    assert conv(Decimal("7.5"), USD, date(2026, 10, 1)) == Decimal("7.5")


def test_euro_as_target() -> None:
    conv = Converter(target=EUR, days=[date(2026, 10, 1)], rates=[{BRL: Decimal("6")}])
    assert conv(Decimal("-1"), BRL, date(2026, 10, 1)) == Decimal("-0.1667")


def test_weekends_carry_fridays_rate() -> None:
    fetched = {
        date(2026, 10, 2): {USD: Decimal("1.1")},  # Friday
        date(2026, 10, 5): {USD: Decimal("1.2")},  # Monday
    }
    rows = fill_days(fetched, date(2026, 10, 5))
    assert [(r["date"].day, r["per_eur"], r["rate_date"].day) for r in rows] == [  # type: ignore[attr-defined]
        (2, Decimal("1.1"), 2),
        (3, Decimal("1.1"), 2),
        (4, Decimal("1.1"), 2),
        (5, Decimal("1.2"), 5),
    ]
    assert fill_days({}, date(2026, 10, 5)) == []


async def test_reads_frankfurter_rates_as_exact_decimals(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[httpx.URL] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request.url)
        body = '{"base":"EUR","rates":{"2026-10-02":{"BRL":6.41960000000000001,"USD":1}}}'
        return httpx.Response(200, text=body)

    monkeypatch.setattr(frankfurter, "transport", httpx.MockTransport(respond))
    rates = await frankfurter.fetch(date(2026, 9, 25), date(2026, 10, 2))
    assert rates == {date(2026, 10, 2): {BRL: Decimal("6.41960000000000001"), USD: Decimal(1)}}
    assert seen[0].path.endswith("/2026-09-25..2026-10-02")
    assert seen[0].params["base"] == "EUR"
    assert seen[0].params["symbols"] == "BRL,USD"
