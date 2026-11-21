"""Card purchases count in the month their bill is paid (or on their own day)."""

from decimal import Decimal
from typing import Any

from httpx import AsyncClient

from tests.integration import test_card_bills_api as cards
from tests.integration.conftest import auth, login
from tests.integration.test_card_bills_api import FakeCardBank, _card_tx, _connect, _sync

bank = cards.bank

CARD = [
    _card_tx("m1", "2026-10-20", "Mercado", 200),
    _card_tx("m2", "2026-11-02", "Farmácia", 80),
    # Paying the bill: a transfer, out of the figures in every mode.
    _card_tx("m3", "2026-11-10", "Pagamento recebido", -280, category="Credit card payment"),
]


async def _get(client: AsyncClient, h: dict[str, str], path: str, **params: str) -> Any:
    r = await client.get(path, params=params, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def _spending(client: AsyncClient, h: dict[str, str], month: str) -> Decimal:
    summary = await _get(client, h, "/api/v1/transactions/summary", month=month)
    return Decimal(summary["currencies"][0]["spending"])


async def _card_id(client: AsyncClient, h: dict[str, str]) -> str:
    accounts = await _get(client, h, "/api/v1/accounts")
    [card] = [a for a in accounts if a["is_card"]]
    return str(card["id"])


async def test_purchases_move_to_the_bill_month(client: AsyncClient, bank: FakeCardBank) -> None:
    h = auth(await login(client))
    bank.card = [dict(t) for t in CARD]
    await _sync(client, h, await _connect(client, h))
    family = await _get(client, h, "/api/v1/family")
    assert family["card_purchases_by"] == "bill"

    # Without its days the card still counts each purchase on its own day.
    assert await _spending(client, h, "2026-10") == Decimal("200.00")
    assert await _spending(client, h, "2026-11") == Decimal("80.00")

    card_id = await _card_id(client, h)
    r = await client.patch(
        f"/api/v1/accounts/{card_id}",
        json={"bill_close_day": 3, "bill_due_day": 10},
        headers=h,
    )
    assert r.status_code == 200, r.text
    assert (r.json()["bill_close_day"], r.json()["bill_due_day"]) == (3, 10)

    # 20 Oct is in the bill due 10 Nov; 2 Nov too (closes on the 3rd).
    assert await _spending(client, h, "2026-10") == Decimal("0")
    assert await _spending(client, h, "2026-11") == Decimal("280.00")
    page = await _get(client, h, "/api/v1/transactions", month="2026-11")
    lines = {t["description"]: (t["date"], t["counts_on"]) for t in page["items"]}
    assert lines["Mercado"] == ("2026-10-20", "2026-11-10")
    totals = await _get(client, h, "/api/v1/transactions/totals", month="2026-11")
    assert Decimal(totals["currencies"][0]["spending"]) == 280
    dashboard = await _get(client, h, "/api/v1/transactions/dashboard", month="2026-11")
    assert sum(Decimal(x) for x in dashboard["currencies"][0]["daily"]) == 280

    # The family goes back to counting each purchase on its own day.
    r = await client.patch("/api/v1/family", json={"card_purchases_by": "purchase"}, headers=h)
    assert r.status_code == 200, r.text
    assert await _spending(client, h, "2026-10") == Decimal("200.00")
    assert await _spending(client, h, "2026-11") == Decimal("80.00")

    # And forward again; a new sync keeps the bill month.
    await client.patch("/api/v1/family", json={"card_purchases_by": "bill"}, headers=h)
    bank.card.append(_card_tx("m4", "2026-11-05", "Padaria", 20))
    await _sync(client, h, await _card_conn(client, h))
    assert await _spending(client, h, "2026-11") == Decimal("280.00")
    assert await _spending(client, h, "2026-12") == Decimal("20.00")


async def _card_conn(client: AsyncClient, h: dict[str, str]) -> str:
    [conn] = (await _get(client, h, "/api/v1/connections"))["connections"]
    return str(conn["id"])


async def test_editing_the_date_moves_the_purchase(client: AsyncClient, bank: FakeCardBank) -> None:
    h = auth(await login(client))
    bank.card = [dict(t) for t in CARD]
    await _sync(client, h, await _connect(client, h))
    card_id = await _card_id(client, h)
    await client.patch(
        f"/api/v1/accounts/{card_id}", json={"bill_close_day": 3, "bill_due_day": 10}, headers=h
    )
    page = await _get(client, h, "/api/v1/transactions", month="2026-11")
    [mercado] = [t for t in page["items"] if t["description"] == "Mercado"]
    r = await client.patch(
        f"/api/v1/transactions/{mercado['id']}", json={"date": "2026-11-04"}, headers=h
    )
    assert r.status_code == 200, r.text
    assert r.json()["counts_on"] == "2026-12-10"


async def test_only_cards_have_bill_days(client: AsyncClient, bank: FakeCardBank) -> None:
    h = auth(await login(client))
    bank.card = [dict(t) for t in CARD]
    await _sync(client, h, await _connect(client, h))
    card_id = await _card_id(client, h)
    r = await client.patch(f"/api/v1/accounts/{card_id}", json={"bill_close_day": 32}, headers=h)
    assert r.status_code == 422
    # Changing only the owner leaves the days alone.
    await client.patch(
        f"/api/v1/accounts/{card_id}", json={"bill_close_day": 3, "bill_due_day": 10}, headers=h
    )
    r = await client.patch(f"/api/v1/accounts/{card_id}", json={"member_id": None}, headers=h)
    assert (r.json()["bill_close_day"], r.json()["bill_due_day"]) == (3, 10)
