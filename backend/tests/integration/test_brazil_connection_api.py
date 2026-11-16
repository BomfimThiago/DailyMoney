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
from tests.integration.conftest import auth, login

AUTH_PAGE = "https://meu.pluggy.ai/authorize?state=abc"
NUBANK = [
    {"id": "nu-acc", "type": "BANK", "currencyCode": "BRL", "name": "Nu Pagamentos S.A."},
]
INTER = [{"id": "in-acc", "type": "BANK", "currencyCode": "BRL", "name": "BANCO INTER"}]


class FakePluggy:
    """Items go: created (no link yet) → link ready → authorized by the person."""

    def __init__(self) -> None:
        self.items: dict[str, dict[str, Any]] = {}
        self.accounts: dict[str, list[dict[str, Any]]] = {}
        self.created: list[dict[str, Any]] = []
        self.deleted: list[str] = []
        # How many reads of a new item come back without the link.
        self.slow_link = 1
        self.down = False
        # Only reading items fails; creating and deleting them still works.
        self.reads_fail = False
        self.accounts_fail = False
        self.deletes_fail = False

    def authorize(self, item_id: str, accounts: list[dict[str, Any]]) -> None:
        self.items[item_id] = {"id": item_id, "status": "UPDATED", "parameter": None}
        self.accounts[item_id] = accounts

    def refuse(self, item_id: str) -> None:
        self.items[item_id] = {"id": item_id, "status": "LOGIN_ERROR", "parameter": None}

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/auth":
            return httpx.Response(200, json={"apiKey": "k"})
        assert request.headers["X-API-KEY"] == "k"
        if self.down:
            return httpx.Response(500, json={"message": "down"})
        if path == "/items" and request.method == "POST":
            body = json.loads(request.content)
            self.created.append(body)
            item_id = f"item-{len(self.created)}"
            self.items[item_id] = {
                "id": item_id,
                "status": "UPDATING",
                "parameter": None,
                "reads": 0,
            }
            return httpx.Response(200, json=self.items[item_id])
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
        if self.reads_fail:
            return httpx.Response(500, json={"message": "items down"})
        item = self.items[item_id]
        if "reads" in item:
            item["reads"] += 1
            if item["reads"] >= self.slow_link:
                item["parameter"] = {"name": "oauthCode", "type": "oauth", "data": AUTH_PAGE}
        return httpx.Response(200, json=item)


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
    waits: list[float] = []

    async def no_wait(seconds: float) -> None:
        waits.append(seconds)

    monkeypatch.setattr(settings, "PLUGGY_CLIENT_ID", "id")
    monkeypatch.setattr(settings, "PLUGGY_CLIENT_SECRET", "secret")
    monkeypatch.setattr(settings, "PLUGGY_ITEM_IDS", [])
    monkeypatch.setattr(settings, "APP_URL", "https://dm.example/")
    monkeypatch.setattr(pluggy, "transport", httpx.MockTransport(fake))
    monkeypatch.setattr(pluggy, "_key", None)
    monkeypatch.setattr(pluggy_link, "pause", no_wait)
    yield fake


async def _start(client: AsyncClient, h: dict[str, str]) -> str:
    r = await client.post("/api/v1/connections/brazil", headers=h)
    assert r.status_code == 200, r.text
    return str(r.json()["url"])


async def _finish(client: AsyncClient, h: dict[str, str]) -> Any:
    r = await client.post("/api/v1/connections/brazil/finish", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def _banks(client: AsyncClient, h: dict[str, str]) -> list[str]:
    conns = (await client.get("/api/v1/connections", headers=h)).json()["connections"]
    return [c["bank"] for c in conns]


async def test_not_configured(client: AsyncClient) -> None:
    h = auth(await login(client))
    assert (await client.post("/api/v1/connections/brazil", headers=h)).status_code == 503
    assert (await _finish(client, h)) == {"status": "nothing", "results": []}
    assert (await client.post("/api/v1/connections/brazil")).status_code == 401
    assert (await client.post("/api/v1/connections/brazil/finish")).status_code == 401


async def test_connect_a_brazilian_bank_from_the_app(client: AsyncClient, fake: FakePluggy) -> None:
    h = auth(await login(client))
    # The link takes a moment: the app keeps asking Pluggy until it is there.
    fake.slow_link = 3
    assert await _start(client, h) == AUTH_PAGE
    assert fake.created == [
        {
            "connectorId": 200,
            "parameters": {},
            "oauthRedirectUri": "https://dm.example/conexoes/retorno-brasil",
        }
    ]

    # Back in the app before authorizing (or while Pluggy still reads the bank).
    assert await _finish(client, h) == {"status": "waiting", "results": []}
    assert await _banks(client, h) == []

    fake.authorize("item-1", NUBANK)
    done = await _finish(client, h)
    assert done["status"] == "connected"
    [result] = done["results"]
    assert (result["connection"]["bank"], result["connection"]["provider"]) == ("Nubank", "pluggy")
    assert [(a["name"], a["new"]) for a in result["accounts"]] == [("Nubank BRL", 1)]
    assert result["connection"]["last_sync_at"]

    # Nothing is left to finish, and the bank stays connected.
    assert await _finish(client, h) == {"status": "nothing", "results": []}
    assert await _banks(client, h) == ["Nubank"]
    assert fake.deleted == []


async def test_a_bank_authorized_without_coming_back_shows_up_in_the_list(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    await _start(client, h)
    fake.authorize("item-1", INTER)
    assert await _banks(client, h) == ["Inter"]
    assert await _finish(client, h) == {"status": "nothing", "results": []}


async def test_one_family_never_finishes_another_familys_bank(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    await _start(client, h)
    fake.authorize("item-1", NUBANK)
    other = auth(await login(client, "token-partner-padded"))
    assert await _finish(client, other) == {"status": "nothing", "results": []}
    assert await _banks(client, other) == []
    assert (await _finish(client, h))["status"] == "connected"


async def test_refused_authorization_is_cleaned_up(client: AsyncClient, fake: FakePluggy) -> None:
    h = auth(await login(client))
    await _start(client, h)
    fake.refuse("item-1")
    assert await _finish(client, h) == {"status": "refused", "results": []}
    assert fake.deleted == ["item-1"]
    assert await _finish(client, h) == {"status": "nothing", "results": []}


async def test_authorized_item_without_accounts_is_not_a_connection(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    await _start(client, h)
    fake.authorize("item-1", [])
    assert await _finish(client, h) == {"status": "refused", "results": []}
    assert fake.deleted == ["item-1"]
    assert await _banks(client, h) == []


async def test_an_attempt_nobody_finished_stops_waiting_after_an_hour(
    client: AsyncClient, fake: FakePluggy, db: AsyncSession
) -> None:
    h = auth(await login(client))
    await _start(client, h)
    almost = datetime.now(UTC) - pluggy_link.GIVE_UP_AFTER + timedelta(minutes=1)
    await db.execute(update(PendingPluggyItem).values(created_at=almost))
    assert (await _finish(client, h))["status"] == "waiting"

    await db.execute(update(PendingPluggyItem).values(created_at=almost - timedelta(minutes=2)))
    # Starting again clears the dead attempt first, so they don't pile up at Pluggy.
    await _start(client, h)
    assert fake.deleted == ["item-1"]
    assert [p.item_id for p in await db.scalars(select(PendingPluggyItem))] == ["item-2"]


async def test_authorizing_the_same_bank_again_renews_its_connection(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    await _start(client, h)
    fake.authorize("item-1", NUBANK)
    first = (await _finish(client, h))["results"][0]["connection"]["id"]

    await _start(client, h)
    fake.authorize("item-2", NUBANK)
    again = await _finish(client, h)
    assert again["results"][0]["connection"]["id"] == first
    assert await _banks(client, h) == ["Nubank"]
    # The first item is left alone at Pluggy: something else may still read it.
    assert fake.deleted == []


async def test_pluggy_never_gives_the_link(client: AsyncClient, fake: FakePluggy) -> None:
    h = auth(await login(client))
    fake.slow_link = 10_000
    r = await client.post("/api/v1/connections/brazil", headers=h)
    assert r.status_code == 502
    assert r.json()["detail"] == "A Pluggy não abriu a página de autorização. Tente de novo."
    assert fake.deleted == ["item-1"]
    assert await _finish(client, h) == {"status": "nothing", "results": []}


async def test_pluggy_out_of_reach_keeps_the_attempt_waiting(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    await _start(client, h)
    fake.authorize("item-1", NUBANK)
    fake.down = True
    assert await _finish(client, h) == {"status": "waiting", "results": []}
    assert (await client.post("/api/v1/connections/brazil", headers=h)).status_code == 502
    fake.down = False
    assert (await _finish(client, h))["status"] == "connected"


async def test_pluggy_failing_while_the_link_is_made_leaves_nothing_behind(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    fake.reads_fail = True
    r = await client.post("/api/v1/connections/brazil", headers=h)
    assert r.status_code == 502
    assert fake.deleted == ["item-1"]
    fake.reads_fail = False
    assert await _finish(client, h) == {"status": "nothing", "results": []}


async def test_accounts_out_of_reach_keep_the_attempt_waiting(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    await _start(client, h)
    fake.authorize("item-1", NUBANK)
    fake.accounts_fail = True
    assert await _finish(client, h) == {"status": "waiting", "results": []}
    assert fake.deleted == []
    fake.accounts_fail = False
    assert (await _finish(client, h))["status"] == "connected"


async def test_deleting_a_dead_attempt_may_fail_quietly(
    client: AsyncClient, fake: FakePluggy
) -> None:
    h = auth(await login(client))
    await _start(client, h)
    fake.refuse("item-1")
    fake.deletes_fail = True
    assert await _finish(client, h) == {"status": "refused", "results": []}
    assert await _finish(client, h) == {"status": "nothing", "results": []}
