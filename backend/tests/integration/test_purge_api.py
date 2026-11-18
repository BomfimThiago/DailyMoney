from datetime import date

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.models import BankConnection
from app.families.models import User
from tests.integration.conftest import auth, login
from tests.integration.test_imports_api import NUBANK, _confirm, _upload


async def test_delete_all_needs_the_confirmed_count(client: AsyncClient, db: AsyncSession) -> None:
    h = auth(await login(client))
    up = await _upload(client, h, NUBANK)
    await _confirm(
        client, h, up["id"], {"accounts": [{"currency": "BRL", "new_account": {"name": "Nu"}}]}
    )
    waiting = await _upload(client, h, NUBANK + "09/10/2026,-10.00,id-5,Padaria Pao\n")
    account_id = waiting["groups"][0]["account"]["id"]
    await client.post(
        f"/api/v1/imports/{waiting['id']}/confirm",
        json={"accounts": [{"currency": "BRL", "account_id": account_id}]},
        headers=h,
    )
    user = await db.scalar(select(User).where(User.email == "thiago@example.com"))
    assert user is not None
    conn = BankConnection(
        family_id=user.family_id,
        provider="enablebanking",
        external_id="s1",
        bank="Wise",
        accounts=[{"key": "a", "synced": True}],
        sync_from=date(2026, 1, 1),
    )
    db.add(conn)
    await db.flush()

    overview = (await client.get("/api/v1/transactions/purge", headers=h)).json()
    assert overview == {"transactions": 5, "to_review": 1, "imports": 2, "banks": 1}

    r = await client.delete("/api/v1/transactions?expected=4", headers=h)
    assert r.status_code == 409
    assert (await client.get("/api/v1/transactions", headers=h)).json()["total"] == 4

    r = await client.delete("/api/v1/transactions?expected=5", headers=h)
    assert r.status_code == 200, r.text
    assert r.json() == {"removed": 5}
    assert (await client.get("/api/v1/transactions", headers=h)).json()["total"] == 0
    assert (await client.get("/api/v1/imports", headers=h)).json() == []
    # Accounts stay; the bank reads its history again on the next sync.
    assert len((await client.get("/api/v1/accounts", headers=h)).json()) == 1
    await db.refresh(conn)
    assert conn.accounts == [{"key": "a", "synced": False}]


async def test_delete_all_only_touches_the_own_family(client: AsyncClient) -> None:
    h = auth(await login(client))
    up = await _upload(client, h, NUBANK)
    await _confirm(
        client, h, up["id"], {"accounts": [{"currency": "BRL", "new_account": {"name": "Nu"}}]}
    )
    other = auth(await login(client, "token-partner-padded"))
    r = await client.delete("/api/v1/transactions?expected=0", headers=other)
    assert r.json() == {"removed": 0}
    assert (await client.get("/api/v1/transactions", headers=h)).json()["total"] == 4
    assert (await client.delete("/api/v1/transactions?expected=0")).status_code == 401
