"""Connecting a Brazilian bank from the app, against a fake Pluggy server."""

import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.models import PendingPluggyItem
from app.connections.services import pluggy, pluggy_link
from app.core.config import settings
from tests.integration.conftest import approve_all, auth, login

NUBANK = [
    {"id": "nu-acc", "type": "BANK", "currencyCode": "BRL", "name": "Nu Pagamentos S.A."},
]
# The same Nubank account seen through a later authorization: Pluggy gives it new ids.
NUBANK_AGAIN = [
    {"id": "nu-acc-2", "type": "BANK", "currencyCode": "BRL", "name": "Nu Pagamentos S.A."},
]
INTER = [{"id": "in-acc", "type": "BANK", "currencyCode": "BRL", "name": "BANCO INTER"}]


class FakePluggy:
    """Hands out connect tokens; items are made by Pluggy's window, here `window_item`."""

    def __init__(self) -> None:
        self.items: dict[str, dict[str, Any]] = {}
        self.accounts: dict[str, list[dict[str, Any]]] = {}
        self.tokens: list[dict[str, Any]] = []
        self.deleted: list[str] = []
        self.down = False
        self.accounts_fail = False
        self.deletes_fail = False

    def window_item(self, owner: str | None = None) -> str:
        """The person got as far as Meu Pluggy's page: the item exists, not authorized."""
        item_id = f"item-{len(self.items) + len(self.deleted) + 1}"
        owner = owner or self.tokens[-1]["options"]["clientUserId"]
        self.items[item_id] = {"id": item_id, "status": "UPDATING", "clientUserId": owner}
        return item_id

    def authorize(self, item_id: str, accounts: list[dict[str, Any]]) -> None:
        self.items[item_id]["status"] = "UPDATED"
        self.accounts[item_id] = accounts

    def refuse(self, item_id: str) -> None:
        self.items[item_id]["status"] = "LOGIN_ERROR"

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/auth":
            return httpx.Response(200, json={"apiKey": "k"})
        assert request.headers["X-API-KEY"] == "k"
        if self.down:
            return httpx.Response(500, json={"message": "down"})
        if path == "/connect_token" and request.method == "POST":
            self.tokens.append(json.loads(request.content))
            return httpx.Response(200, json={"accessToken": f"token-{len(self.tokens)}"})
        if path == "/items" and request.method == "POST":
            return httpx.Response(
                400,
                json={
                    "message": "Free subscription can only create items through our Connect Widget"
                },
            )
        if path.startswith("/items/"):
            return self._item(request.method, path.removeprefix("/items/"))
        if path == "/accounts" and self.accounts_fail:
            return httpx.Response(500, json={"message": "accounts down"})
        if path == "/accounts":
            return httpx.Response(
                200, json={"results": self.accounts.get(request.url.params["itemId"], [])}
            )
        if path == "/v2/transactions":
            return httpx.Response(200, json={"results": [_tx(request.url.params["accountId"])]})
        return httpx.Response(404, json={"message": "not found"})

    def _item(self, method: str, item_id: str) -> httpx.Response:
        if item_id not in self.items:
            return httpx.Response(404, json={"message": "item not found"})
        if method == "DELETE" and self.deletes_fail:
            return httpx.Response(500, json={"message": "delete failed"})
        if method == "DELETE":
            self.deleted.append(item_id)
            del self.items[item_id]
            return httpx.Response(200, json={"count": 1})
        return httpx.Response(200, json=self.items[item_id])


def _tx(account: str) -> dict[str, Any]:
    return {
        "id": f"t-{account}",
        "date": "2026-10-03T15:00:00.000Z",
        "description": "Padaria",
        "amount": -12.5,
        "currencyCode": "BRL",
    }


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakePluggy]:
    fake = FakePluggy()
    monkeypatch.setattr(settings, "PLUGGY_CLIENT_ID", "id")
    monkeypatch.setattr(settings, "PLUGGY_CLIENT_SECRET", "secret")
    monkeypatch.setattr(settings, "APP_URL", "https://dm.example/")
    monkeypatch.setattr(pluggy, "transport", httpx.MockTransport(fake))
    monkeypatch.setattr(pluggy, "_key", None)
    yield fake


async def _open_window(client: AsyncClient, h: dict[str, str], fake: FakePluggy) -> str:
    """Conectar was pressed and the person reached Meu Pluggy: the app tells the item."""
    r = await client.post("/api/v1/connections/brazil", headers=h)
    assert r.status_code == 200, r.text
    item_id = fake.window_item()
    r = await client.post("/api/v1/connections/brazil/items", json={"item_id": item_id}, headers=h)
    assert r.status_code == 204, r.text
    return item_id


async def _finish(client: AsyncClient, h: dict[str, str]) -> Any:
    r = await client.post("/api/v1/connections/brazil/finish", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def _banks(client: AsyncClient, h: dict[str, str]) -> list[str]:
    conns = (await client.get("/api/v1/connections", headers=h)).json()["connections"]
    return [c["bank"] for c in conns]


NOTHING = {"status": "nothing", "results": []}
WAITING = {"status": "waiting", "results": []}
REFUSED = {"status": "refused", "results": []}


async def test_not_configured(client: AsyncClient) -> None:
    h = auth(await login(client))
    assert (await client.post("/api/v1/connections/brazil", headers=h)).status_code == 503
    assert await _finish(client, h) == NOTHING
    for path in ("brazil", "brazil/items", "brazil/finish"):
        assert (await client.post(f"/api/v1/connections/{path}")).status_code == 401


async def test_connect_a_brazilian_bank_from_the_app(client: AsyncClient, fake: FakePluggy) -> None:
    h = auth(await login(client))
    r = await client.post("/api/v1/connections/brazil", headers=h)
    assert r.json() == {"connect_token": "token-1", "connector_id": 200}
    family_id = fake.tokens[0]["options"]["clientUserId"]
    assert fake.tokens == [
        {
            "options": {
                "clientUserId": family_id,
                "oauthRedirectUri": "https://dm.example/conexoes/retorno-brasil",
            }
        }
    ]
    item_id = fake.window_item()
    body = {"item_id": item_id}
    r = await client.post("/api/v1/connections/brazil/items", json=body, headers=h)
    assert r.status_code == 204

    # Before authorizing (or while Pluggy still reads the bank).
    assert await _finish(client, h) == WAITING
    assert await _banks(client, h) == []

    fake.authorize(item_id, NUBANK)
    # The window tells the same item more than once; it is still one bank.
    r = await client.post("/api/v1/connections/brazil/items", json=body, headers=h)
    assert r.status_code == 204
    done = await _finish(client, h)
    assert done["status"] == "connected"
    [result] = done["results"]
    assert (result["connection"]["bank"], result["connection"]["provider"]) == ("Nubank", "pluggy")
    assert [(a["name"], a["new"]) for a in result["accounts"]] == [("Nubank BRL", 1)]
    assert result["connection"]["last_sync_at"]

    # Nothing is left to finish, the bank stays connected, and telling the item once
    # more doesn't start it over.
    assert await _finish(client, h) == NOTHING
    r = await client.post("/api/v1/connections/brazil/items", json=body, headers=h)
    assert r.status_code == 204
    assert await _finish(client, h) == NOTHING
    assert await _banks(client, h) == ["Nubank"]
    assert fake.deleted == []


async def test_a_bank_authorized_without_coming_back_shows_up_in_the_list(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    item_id = await _open_window(client, h, fake)
    fake.authorize(item_id, INTER)
    assert await _banks(client, h) == ["Inter"]
    assert await _finish(client, h) == NOTHING


async def test_only_the_familys_own_items_are_accepted(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    item_id = await _open_window(client, h, fake)
    fake.authorize(item_id, NUBANK)
    other = auth(await login(client, "token-partner-padded"))
    # Another family can't take the item, nor finish it.
    r = await client.post(
        "/api/v1/connections/brazil/items", json={"item_id": item_id}, headers=other
    )
    assert r.status_code == 404
    assert await _finish(client, other) == NOTHING
    assert await _banks(client, other) == []
    # An item made by hand in Pluggy's dashboard belongs to no family.
    by_hand = fake.window_item(owner="")
    fake.items[by_hand]["clientUserId"] = None
    r = await client.post("/api/v1/connections/brazil/items", json={"item_id": by_hand}, headers=h)
    assert r.status_code == 404
    r = await client.post("/api/v1/connections/brazil/items", json={"item_id": "gone"}, headers=h)
    assert r.status_code == 502
    r = await client.post("/api/v1/connections/brazil/items", json={"item_id": " "}, headers=h)
    assert r.status_code == 422
    assert (await _finish(client, h))["status"] == "connected"


async def test_refused_authorization_is_cleaned_up(client: AsyncClient, fake: FakePluggy) -> None:
    h = auth(await login(client))
    item_id = await _open_window(client, h, fake)
    fake.refuse(item_id)
    assert await _finish(client, h) == REFUSED
    assert fake.deleted == [item_id]
    assert await _finish(client, h) == NOTHING


async def test_authorized_item_without_accounts_is_not_a_connection(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    item_id = await _open_window(client, h, fake)
    fake.authorize(item_id, [])
    assert await _finish(client, h) == REFUSED
    assert fake.deleted == [item_id]
    assert await _banks(client, h) == []


async def test_an_attempt_nobody_finished_stops_waiting_after_an_hour(
    client: AsyncClient, fake: FakePluggy, db: AsyncSession
) -> None:
    h = auth(await login(client))
    first = await _open_window(client, h, fake)
    almost = datetime.now(UTC) - pluggy_link.GIVE_UP_AFTER + timedelta(minutes=1)
    await db.execute(update(PendingPluggyItem).values(created_at=almost))
    assert await _finish(client, h) == WAITING

    await db.execute(update(PendingPluggyItem).values(created_at=almost - timedelta(minutes=2)))
    # Starting again clears the dead attempt first, so they don't pile up at Pluggy.
    second = await _open_window(client, h, fake)
    assert fake.deleted == [first]
    assert [p.item_id for p in await db.scalars(select(PendingPluggyItem))] == [second]


async def test_authorizing_the_same_bank_again_renews_its_connection(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    fake.authorize(await _open_window(client, h, fake), NUBANK)
    first = (await _finish(client, h))["results"][0]["connection"]["id"]

    fake.authorize(await _open_window(client, h, fake), NUBANK)
    again = await _finish(client, h)
    assert again["results"][0]["connection"]["id"] == first
    assert await _banks(client, h) == ["Nubank"]
    # The first item is left alone at Pluggy: something else may still read it.
    assert fake.deleted == []


async def test_pluggy_out_of_reach_keeps_the_attempt_waiting(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    item_id = await _open_window(client, h, fake)
    fake.authorize(item_id, NUBANK)
    fake.down = True
    assert await _finish(client, h) == WAITING
    assert (await client.post("/api/v1/connections/brazil", headers=h)).status_code == 502
    fake.down = False
    fake.accounts_fail = True
    assert await _finish(client, h) == WAITING
    assert fake.deleted == []
    fake.accounts_fail = False
    assert (await _finish(client, h))["status"] == "connected"


async def test_deleting_a_dead_attempt_may_fail_quietly(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    fake.refuse(await _open_window(client, h, fake))
    fake.deletes_fail = True
    assert await _finish(client, h) == REFUSED
    assert await _finish(client, h) == NOTHING


async def test_connecting_a_bank_again_after_removing_it_duplicates_nothing(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    fake.authorize(await _open_window(client, h, fake), NUBANK)
    first = (await _finish(client, h))["results"][0]
    assert first["accounts"][0]["new"] == 1
    conn_id = first["connection"]["id"]
    assert (await client.delete(f"/api/v1/connections/{conn_id}", headers=h)).status_code == 204
    assert await _banks(client, h) == []

    fake.authorize(await _open_window(client, h, fake), NUBANK_AGAIN)
    again = (await _finish(client, h))["results"][0]
    # Same day and amount as a line already saved: it is the same purchase, new id or not.
    assert [(a["name"], a["new"], a["duplicate"]) for a in again["accounts"]] == [
        ("Nubank BRL", 0, 1)
    ]
    accounts = (await client.get("/api/v1/accounts", headers=h)).json()
    assert [a["name"] for a in accounts] == ["Nubank BRL"]
    await approve_all(client, h)
    txs = (await client.get("/api/v1/transactions?month=2026-10", headers=h)).json()["items"]
    assert len(txs) == 1
