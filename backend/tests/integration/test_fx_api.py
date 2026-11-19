"""Every screen in one chosen currency, each line converted with its day's ECB rate."""

from collections.abc import Iterator
from datetime import date, timedelta

import httpx
import pytest
from httpx import AsyncClient

from app.fx.services import frankfurter
from tests.integration.conftest import auth, login
from tests.integration.test_overview_api import NUBANK, WISE_USD, _get, _import

# One euro buys 6 reais and 1.2 dollars on every business day: R$ 600 = € 100 = US$ 120.
RATES = '{"BRL": 6, "USD": 1.2}'


class FakeEcb:
    def __init__(self) -> None:
        self.calls = 0
        self.down = False

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        if self.down:
            return httpx.Response(503)
        lo, hi = (date.fromisoformat(d) for d in request.url.path.rsplit("/", 1)[1].split(".."))
        days = [lo + timedelta(n) for n in range((hi - lo).days + 1)]
        body = ",".join(f'"{d}": {RATES}' for d in days if d.weekday() < 5)
        return httpx.Response(200, text=f'{{"base": "EUR", "rates": {{{body}}}}}')


@pytest.fixture
def ecb(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeEcb]:
    fake = FakeEcb()
    monkeypatch.setattr(frankfurter, "transport", httpx.MockTransport(fake))
    yield fake


async def test_summary_in_each_currency(client: AsyncClient, ecb: FakeEcb) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    await _import(client, h, WISE_USD, "wise-usd.csv", "Wise USD")

    plain = await _get(client, h, "/api/v1/transactions/summary?month=2026-10")
    assert [c["currency"] for c in plain["currencies"]] == ["BRL", "USD"]
    assert ecb.calls == 0

    usd = await _get(client, h, "/api/v1/transactions/summary?month=2026-10&currency=USD")
    [only] = usd["currencies"]
    # R$ 5000 income → US$ 1000; R$ 1050 spending (R$ 700 of it the aplicação net of the
    # resgate) → US$ 210; the Wise line is a transfer.
    assert (only["currency"], only["income"], only["spending"]) == ("USD", "1000.0000", "210.0000")

    eur = await _get(client, h, "/api/v1/transactions/summary?month=2026-10&currency=EUR")
    assert eur["currencies"][0]["income"] == "833.3333"
    # The rates are kept: asking again does not call the bank.
    calls = ecb.calls
    await _get(client, h, "/api/v1/transactions/summary?month=2026-10&currency=BRL")
    assert ecb.calls == calls


async def test_dashboard_analysis_investments_and_lines_converted(
    client: AsyncClient, ecb: FakeEcb
) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    q = "month=2026-10&currency=USD"

    dash = await _get(client, h, f"/api/v1/transactions/dashboard?{q}")
    [d] = dash["currencies"]
    assert d["currency"] == "USD"
    assert d["daily"][2] == "40.0000"  # Mercadona, R$ 200

    analysis = await _get(client, h, f"/api/v1/transactions/analysis?{q}&months=3")
    [a] = analysis["currencies"]
    assert (a["currency"], a["months"][-1]["amount"]) == ("USD", "210.0000")

    inv = await _get(client, h, f"/api/v1/transactions/investments?{q}")
    assert inv["totals"] == [
        {"currency": "USD", "put_in": "280.0000", "taken_out": "60.0000", "net": "220.0000"}
    ]
    assert inv["products"][0]["currency"] == "USD"
    assert inv["movements"][0]["display_amount"] == "60.0000"

    page = await _get(client, h, f"/api/v1/transactions?{q}&kind=regular&limit=1")
    [line] = page["items"]
    assert (line["amount"], line["currency"]) == ("-150.0000", "BRL")
    assert (line["display_amount"], line["display_currency"]) == ("-30.0000", "USD")

    page = await _get(client, h, "/api/v1/transactions?month=2026-10&limit=1")
    assert page["items"][0]["display_amount"] is None


async def test_no_accounts_means_no_figures(client: AsyncClient, ecb: FakeEcb) -> None:
    h = auth(await login(client))
    summary = await _get(client, h, "/api/v1/transactions/summary?month=2026-10&currency=EUR")
    assert summary["currencies"] == []


async def test_rate_service_down(client: AsyncClient, ecb: FakeEcb) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    ecb.down = True
    r = await client.get("/api/v1/transactions/summary?month=2026-10&currency=USD", headers=h)
    assert r.status_code == 503
    assert r.json()["code"] == "FX_UNAVAILABLE"

    # Once some rates are kept, the nearest ones are used while the service is down.
    ecb.down = False
    await _get(client, h, "/api/v1/transactions/summary?month=2026-09&currency=USD")
    ecb.down = True
    summary = await _get(client, h, "/api/v1/transactions/summary?month=2026-10&currency=USD")
    assert summary["currencies"][0]["income"] == "1000.0000"
