"""The bank's investment portfolio: read on every Pluggy sync, shown by /portfolio."""

from collections.abc import Iterator
from datetime import date, timedelta
from typing import Any

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.services import pluggy
from app.core.config import settings
from app.fx.services import frankfurter
from app.portfolio.models import InvestmentSnapshot
from tests.integration.conftest import auth, login
from tests.integration.test_brazil_connection_api import (
    INTER,
    NUBANK,
    FakePluggy,
    _finish,
    _open_window,
)
from tests.integration.test_fx_api import FakeEcb

TODAY = date.today()


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakePluggy]:
    fake = FakePluggy()
    monkeypatch.setattr(settings, "PLUGGY_CLIENT_ID", "id")
    monkeypatch.setattr(settings, "PLUGGY_CLIENT_SECRET", "secret")
    monkeypatch.setattr(pluggy, "transport", httpx.MockTransport(fake))
    monkeypatch.setattr(pluggy, "_key", None)
    yield fake


@pytest.fixture
def ecb(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeEcb]:
    fake = FakeEcb()
    monkeypatch.setattr(frankfurter, "transport", httpx.MockTransport(fake))
    yield fake


def _iso(day: date) -> str:
    # Pluggy sends instants in UTC; 12:00 UTC is the same day in Brasília.
    return f"{day.isoformat()}T12:00:00.000Z"


def _inv(id_: str, **over: object) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": id_,
        "name": f"CDB {id_}",
        "type": "FIXED_INCOME",
        "subtype": "CDB",
        "issuer": "Banco Exemplo",
        "currencyCode": "BRL",
        "balance": 1100,
        "amountOriginal": 1000,
        "rate": 100,
        "rateType": "CDI",
        "dueDate": _iso(TODAY + timedelta(days=200)),
        "date": _iso(TODAY),
        "status": "ACTIVE",
    }
    return {**base, **over}


async def _portfolio(client: AsyncClient, h: dict[str, str], query: str = "") -> Any:
    r = await client.get(f"/api/v1/portfolio{query}", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def _connect(client: AsyncClient, h: dict[str, str], fake: FakePluggy, accounts: Any) -> str:
    item_id = await _open_window(client, h, fake)
    fake.authorize(item_id, accounts)
    return item_id


async def _sync(client: AsyncClient, h: dict[str, str]) -> Any:
    conns = (await client.get("/api/v1/connections", headers=h)).json()["connections"]
    for c in conns:
        r = await client.post(f"/api/v1/connections/{c['id']}/sync", headers=h)
        assert r.status_code == 200, r.text
    return conns


async def test_empty_without_a_connected_bank(client: AsyncClient) -> None:
    h = auth(await login(client))
    p = await _portfolio(client, h)
    assert (p["currency"], p["total"], p["count"], p["has_source"]) == ("BRL", "0", 0, False)
    assert (p["classes"], p["history"], p["ladder"], p["tracked"]) == ([], [], None, None)
    assert (await client.get("/api/v1/portfolio")).status_code == 401


async def test_connected_bank_brings_its_portfolio(
    client: AsyncClient,
    fake: FakePluggy,
) -> None:
    h = auth(await login(client))
    item = await _connect(client, h, fake, NUBANK)
    fake.investments[item] = [
        _inv("cdb"),
        _inv(
            "tesouro",
            name="Tesouro IPCA+ 2035",
            subtype="TREASURY",
            balance=3000.5,
            amountOriginal=2500,
            rate=100,
            rateType="IPCA",
            fixedAnnualRate=6.5,
            dueDate=_iso(date(TODAY.year + 9, 5, 15)),
        ),
        _inv(
            "bova",
            name="BOVA11",
            type="ETF",
            subtype=None,
            balance=400,
            amountOriginal=None,
            rate=None,
            rateType=None,
            dueDate=None,
        ),
        _inv("old", balance=0, status="TOTAL_WITHDRAWAL"),
    ]
    done = await _finish(client, h)
    assert done["results"][0]["connection"]["last_error"] is None

    p = await _portfolio(client, h)
    assert (p["total"], p["count"], p["closed"], p["has_source"]) == ("4500.5000", 3, 1, True)
    assert p["value_date"] == TODAY.isoformat()
    assert [(c["label"], c["total"], c["share"]) for c in p["classes"]] == [
        ("Tesouro Direto", "3000.5000", "0.6667"),
        ("Renda fixa", "1100.0000", "0.2444"),
        ("ETFs", "400.0000", "0.0889"),
    ]
    tesouro = p["classes"][0]["positions"][0]
    assert (tesouro["name"], tesouro["rate_label"], tesouro["gain"]) == (
        "Tesouro IPCA+ 2035",
        "IPCA + 6,5% a.a.",
        "500.5000",
    )
    assert p["classes"][2]["positions"][0]["gain"] is None
    assert p["tracked"] == {
        "invested": "3500.00",
        "value": "4100.5000",
        "gain": "600.5000",
        "gain_pct": "17.2",
    }
    assert p["banks"] == [{"bank": "Nubank", "total": "4500.5000"}]
    assert p["maturing"] == {"months": 12, "count": 1, "total": "1100.0000"}
    steps = p["ladder"]["steps"]
    assert (steps[0]["label"], steps[-1]["label"]) == (str(TODAY.year), f"{TODAY.year + 7}+")
    assert p["ladder"]["undated_total"] == "400.0000"
    assert p["history"] == [{"date": TODAY.isoformat(), "total": "4500.5000"}]

    # Another family sees none of it.
    other = auth(await login(client, "token-partner-padded"))
    assert (await _portfolio(client, other))["count"] == 0


async def test_reading_again_updates_without_duplicating_and_keeps_history(
    client: AsyncClient,
    fake: FakePluggy,
    db: AsyncSession,
) -> None:
    h = auth(await login(client))
    item = await _connect(client, h, fake, INTER)
    fake.investments[item] = [_inv("a"), _inv("b", balance=500, amountOriginal=None)]
    await _finish(client, h)
    # Yesterday's read, as if it happened then.
    await db.execute(update(InvestmentSnapshot).values(date=TODAY - timedelta(days=1)))

    # Today "a" grew and "b" is no longer reported by the bank.
    fake.investments[item] = [_inv("a", balance=1200)]
    await _sync(client, h)
    p = await _portfolio(client, h)
    assert (p["total"], p["count"], p["closed"]) == ("1200.0000", 1, 1)
    assert p["history"] == [
        {"date": (TODAY - timedelta(days=1)).isoformat(), "total": "1600.0000"},
        {"date": TODAY.isoformat(), "total": "1200.0000"},
    ]
    assert len(list(await db.scalars(select(InvestmentSnapshot)))) == 4


async def test_failing_or_partial_read_keeps_the_positions(
    client: AsyncClient,
    fake: FakePluggy,
) -> None:
    h = auth(await login(client))
    item = await _connect(client, h, fake, NUBANK)
    fake.investments[item] = [_inv("a"), _inv("b")]
    await _finish(client, h)

    fake.investments_fail = True
    [conn] = await _sync(client, h)
    conns = (await client.get("/api/v1/connections", headers=h)).json()["connections"]
    assert conns[0]["last_error"].startswith("Investimentos: A Pluggy respondeu 500")
    assert (await _portfolio(client, h))["count"] == 2

    # One unreadable and "b" missing: an incomplete read closes nothing.
    fake.investments_fail = False
    fake.investments[item] = [_inv("a"), _inv("x", currencyCode="JPY")]
    await _sync(client, h)
    conns = (await client.get("/api/v1/connections", headers=h)).json()["connections"]
    assert "1 ilegível(is)" in conns[0]["last_error"]
    assert (await _portfolio(client, h))["count"] == 2
    assert conn["bank"] == "Nubank"


async def test_disconnecting_closes_positions_but_keeps_history(
    client: AsyncClient,
    fake: FakePluggy,
) -> None:
    h = auth(await login(client))
    item = await _connect(client, h, fake, NUBANK)
    fake.investments[item] = [_inv("a")]
    await _finish(client, h)
    [conn] = (await client.get("/api/v1/connections", headers=h)).json()["connections"]
    r = await client.delete(f"/api/v1/connections/{conn['id']}", headers=h)
    assert r.status_code == 204
    p = await _portfolio(client, h)
    assert (p["count"], p["closed"], p["has_source"]) == (0, 1, False)
    assert p["history"] == [{"date": TODAY.isoformat(), "total": "0.0000"}]


async def test_shown_in_the_chosen_currency(
    client: AsyncClient,
    fake: FakePluggy,
    ecb: FakeEcb,
) -> None:
    h = auth(await login(client))
    item = await _connect(client, h, fake, NUBANK)
    # A weekday, so the ECB has a rate for it: R$ 600 = € 100 = US$ 120.
    day = TODAY - timedelta(days=(TODAY.weekday() - 4) % 7 if TODAY.weekday() > 4 else 0)
    fake.investments[item] = [
        _inv("brl", balance=600, amountOriginal=None, date=_iso(day)),
        _inv("usd", currencyCode="USD", balance=132, amountOriginal=120, date=_iso(day)),
    ]
    await _finish(client, h)
    p = await _portfolio(client, h)
    assert ecb.calls == 1
    assert (p["currency"], p["total"]) == ("BRL", "1260.0000")
    usd = next(x for c in p["classes"] for x in c["positions"] if x["currency"] == "USD")
    assert (usd["balance"], usd["value"], usd["gain"]) == ("132.0000", "660.0000", "60.0000")
    eur = await _portfolio(client, h, "?currency=EUR")
    assert (eur["currency"], eur["total"], eur["history"][0]["total"]) == (
        "EUR",
        "210.0000",
        "210.0000",
    )
