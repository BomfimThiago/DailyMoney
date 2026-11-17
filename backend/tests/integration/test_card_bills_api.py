"""Credit card bills and installments, read from a (fake) Meu Pluggy card."""

import json
from datetime import date
from typing import Any

import httpx
import pytest
from httpx import AsyncClient

from app.connections.services import pluggy
from app.core.config import settings
from app.transactions.services import card_service
from tests.integration.conftest import approve_all, auth, login
from tests.integration.test_fx_api import FakeEcb, ecb  # noqa: F401


def _card_tx(
    tx_id: str, day: str, description: str, amount: float, bill: str | None = None, **extra: Any
) -> dict[str, Any]:
    tx: dict[str, Any] = {
        "id": tx_id,
        "date": f"{day}T15:00:00.000Z",
        "description": description,
        "amount": amount,
        "currencyCode": "BRL",
        **extra,
    }
    if bill:
        meta = {"billForecastDate": f"{bill}-10"}
        if "installment" in extra:
            n, total = extra.pop("installment")
            tx.pop("installment")
            meta |= {"installmentNumber": n, "totalInstallments": total}
        tx["creditCardMetadata"] = meta
    return tx


class FakeCardBank:
    def __init__(self) -> None:
        self.card: list[dict[str, Any]] = []
        self.owner = ""

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/auth":
            return httpx.Response(200, json={"apiKey": "k"})
        if path == "/connect_token":
            self.owner = json.loads(request.content)["options"]["clientUserId"]
            return httpx.Response(200, json={"accessToken": "token"})
        if path == "/items/item-nu":
            item = {"id": "item-nu", "status": "UPDATED", "clientUserId": self.owner}
            return httpx.Response(200, json=item)
        if path == "/accounts":
            card = {"id": "nu-card", "type": "CREDIT", "currencyCode": "BRL", "name": "Nubank"}
            return httpx.Response(200, json={"results": [card]})
        if path == "/v2/transactions":
            return httpx.Response(200, json={"results": self.card, "next": None})
        return httpx.Response(404, json={"message": "not found"})


@pytest.fixture
def bank(monkeypatch: pytest.MonkeyPatch) -> FakeCardBank:
    fake = FakeCardBank()
    monkeypatch.setattr(settings, "PLUGGY_CLIENT_ID", "id")
    monkeypatch.setattr(settings, "PLUGGY_CLIENT_SECRET", "secret")
    monkeypatch.setattr(pluggy, "transport", httpx.MockTransport(fake))
    monkeypatch.setattr(pluggy, "_key", None)
    monkeypatch.setattr(card_service, "clock", lambda: date(2026, 11, 17))
    return fake


async def _connect(client: AsyncClient, h: dict[str, str]) -> str:
    await client.post("/api/v1/connections/brazil", headers=h)
    r = await client.post(
        "/api/v1/connections/brazil/items", json={"item_id": "item-nu"}, headers=h
    )
    assert r.status_code == 204, r.text
    [conn] = (await client.get("/api/v1/connections", headers=h)).json()["connections"]
    return str(conn["id"])


async def _sync(client: AsyncClient, h: dict[str, str], conn_id: str) -> None:
    r = await client.post(f"/api/v1/connections/{conn_id}/sync", headers=h)
    assert r.status_code == 200, r.text
    await approve_all(client, h)


async def _bills(client: AsyncClient, h: dict[str, str], month: str, **params: str) -> Any:
    r = await client.get(
        "/api/v1/transactions/card-bills", params={"month": month, **params}, headers=h
    )
    assert r.status_code == 200, r.text
    return r.json()


OCTOBER_CARD = [
    # Made in September, charged in October's bill.
    _card_tx("c1", "2026-09-20", "Mercado", 200, "2026-10"),
    _card_tx("c2", "2026-09-25", "Loja de sofás", 300, "2026-10", installment=(3, 10)),
    # A refund lowers the bill.
    _card_tx("c3", "2026-09-28", "Estorno Mercado", -50, "2026-10"),
    # Already in November's bill.
    _card_tx("c4", "2026-10-02", "Farmácia", 80, "2026-11"),
    # Paying October's bill: money arriving on the card, not a purchase.
    _card_tx("c5", "2026-10-10", "Pagamento recebido", -450, None, category="Credit card payment"),
]


async def test_bill_of_the_month_paid_and_the_next_one(
    client: AsyncClient, bank: FakeCardBank
) -> None:
    h = auth(await login(client))
    bank.card = [dict(t) for t in OCTOBER_CARD]
    await _sync(client, h, await _connect(client, h))

    data = await _bills(client, h, "2026-10")
    assert data["bills_known"] is True
    [card] = data["cards"]
    assert card["account_name"] == "Nubank cartão"
    assert card["currency"] == "BRL"
    assert card["bill"] == {"month": "2026-10", "total": "450.00", "count": 3}
    assert card["next"] == {"month": "2026-11", "total": "80.00", "count": 1}
    assert card["paid"] == "450.00"
    assert card["payments"] == [{"date": "2026-10-10", "amount": "450.00"}]
    assert card["status"] == "paid"
    assert card["months"] == ["2026-11", "2026-10"]

    # November's bill isn't paid yet, and November isn't over.
    nov = (await _bills(client, h, "2026-11"))["cards"][0]
    assert (nov["bill"]["total"], nov["status"]) == ("80.00", "open")
    # A month that is over without payment.
    card_service.clock = lambda: date(2026, 12, 3)
    nov = (await _bills(client, h, "2026-11"))["cards"][0]
    assert nov["status"] == "unpaid"
    # A month with no purchases in its bill.
    sept = (await _bills(client, h, "2026-09"))["cards"][0]
    assert (sept["bill"]["count"], sept["status"]) == (0, "empty")

    # The bill's purchases, whatever day they were made, with the installment.
    r = await client.get(
        "/api/v1/transactions",
        params={"account_id": card["account_id"], "card_bill": "2026-10"},
        headers=h,
    )
    items = {t["description"]: t for t in r.json()["items"]}
    assert set(items) == {"Mercado", "Loja de sofás", "Estorno Mercado"}
    assert items["Loja de sofás"]["installment"] == "3/10"
    assert items["Loja de sofás"]["card_bill"] == "2026-10"
    assert items["Mercado"]["installment"] is None


async def test_bills_in_another_currency(
    client: AsyncClient,
    bank: FakeCardBank,
    ecb: FakeEcb,  # noqa: F811
) -> None:
    h = auth(await login(client))
    bank.card = [dict(t) for t in OCTOBER_CARD]
    await _sync(client, h, await _connect(client, h))
    card = (await _bills(client, h, "2026-10", currency="EUR"))["cards"][0]
    # 6 reais per euro.
    assert (card["currency"], card["bill"]["total"], card["paid"]) == ("EUR", "75.00", "75.00")


async def test_lines_read_before_bills_learn_them_on_the_next_read(
    client: AsyncClient, bank: FakeCardBank
) -> None:
    h = auth(await login(client))
    # The bank sends the same purchases without saying the bill (like lines read before).
    bank.card = [{k: v for k, v in t.items() if k != "creditCardMetadata"} for t in OCTOBER_CARD]
    conn_id = await _connect(client, h)
    await _sync(client, h, conn_id)
    assert (await _bills(client, h, "2026-10")) == {
        "month": "2026-10",
        "bills_known": False,
        "cards": [],
    }

    bank.card = [dict(t) for t in OCTOBER_CARD]
    await _sync(client, h, conn_id)
    card = (await _bills(client, h, "2026-10"))["cards"][0]
    assert card["bill"]["count"] == 3
    r = await client.get("/api/v1/transactions?month=2026-09", headers=h)
    assert {t["description"]: t["installment"] for t in r.json()["items"]}["Loja de sofás"] == (
        "3/10"
    )


async def test_no_cards_and_other_families(client: AsyncClient, bank: FakeCardBank) -> None:
    h = auth(await login(client))
    bank.card = [dict(t) for t in OCTOBER_CARD]
    await _sync(client, h, await _connect(client, h))
    other = auth(await login(client, "token-partner-padded"))
    assert (await _bills(client, other, "2026-10"))["cards"] == []
    r = await client.get("/api/v1/transactions/card-bills", params={"month": "2026-13"}, headers=h)
    assert r.status_code == 422
