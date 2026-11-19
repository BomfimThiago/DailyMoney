from datetime import date
from typing import Any

from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.connections.models import BankConnection
from app.families.models import User
from tests.integration.conftest import auth, login
from tests.integration.test_imports_api import NUBANK, NUBANK_CARD, _confirm, _upload

NEW_NU = {"accounts": [{"currency": "BRL", "new_account": {"name": "Nu"}}]}
NEW_CARD = {"accounts": [{"currency": "BRL", "new_account": {"name": "Cartão Inter"}}]}


async def _two_banks(client: AsyncClient, db: AsyncSession) -> tuple[dict[str, str], str, str]:
    """Nubank's checking account and a card that we say is from Inter; the card's bill
    payment pairs the two as a transfer."""
    h = auth(await login(client))
    nu = await _upload(client, h, NUBANK)
    await _confirm(client, h, nu["id"], NEW_NU)
    card = await _upload(client, h, NUBANK_CARD, name="fatura.csv")
    await _confirm(client, h, card["id"], NEW_CARD)
    await db.execute(update(Account).where(Account.name == "Cartão Inter").values(bank="Inter"))
    await db.flush()
    return h, nu["id"], card["id"]


async def _banks(client: AsyncClient, h: dict[str, str]) -> list[dict[str, Any]]:
    r = await client.get("/api/v1/transactions/purge/banks", headers=h)
    assert r.status_code == 200, r.text
    data: list[dict[str, Any]] = r.json()
    return data


async def test_lists_each_bank_with_its_accounts_and_lines(
    client: AsyncClient, db: AsyncSession
) -> None:
    h, _, _ = await _two_banks(client, db)
    banks = await _banks(client, h)
    assert [(b["bank"], b["transactions"]) for b in banks] == [("Inter", 3), ("Nubank", 4)]
    [inter] = [b for b in banks if b["bank"] == "Inter"]
    assert [(a["name"], a["transactions"]) for a in inter["accounts"]] == [("Cartão Inter", 3)]
    assert inter["to_review"] == 0
    assert inter["imports"] == 1
    assert inter["connected"] is False


async def test_deletes_only_the_chosen_bank(client: AsyncClient, db: AsyncSession) -> None:
    h, nu_import, card_import = await _two_banks(client, db)
    user = await db.scalar(select(User).where(User.email == "thiago@example.com"))
    assert user is not None
    card = await db.scalar(select(Account).where(Account.name == "Cartão Inter"))
    nu = await db.scalar(select(Account).where(Account.name == "Nu"))
    assert card is not None and nu is not None
    conn = BankConnection(
        family_id=user.family_id,
        provider="enablebanking",
        external_id="s1",
        bank="Inter",
        accounts=[
            {"key": "a", "account_id": str(card.id), "synced": True},
            {"key": "b", "account_id": str(nu.id), "synced": True},
        ],
        sync_from=date(2026, 1, 1),
    )
    db.add(conn)
    await db.flush()

    # The count the person saw must still be right.
    r = await client.delete("/api/v1/transactions/bank?bank=Inter&expected=2", headers=h)
    assert r.status_code == 409
    r = await client.delete("/api/v1/transactions/bank?bank=Inter&expected=3", headers=h)
    assert r.status_code == 200, r.text
    assert r.json() == {"removed": 3}

    items = (await client.get("/api/v1/transactions", headers=h)).json()["items"]
    assert len(items) == 4
    # The bill payment lost its other side: it waits for the person again.
    transfers = (await client.get("/api/v1/transactions/transfers?month=2026-10", headers=h)).json()
    assert [t["description"] for t in transfers["pending"]] == ["Pagamento de fatura"]
    # Only the card's statement leaves the history; the account itself stays.
    assert [i["id"] for i in (await client.get("/api/v1/imports", headers=h)).json()] == [nu_import]
    assert card_import != nu_import
    assert len((await client.get("/api/v1/accounts", headers=h)).json()) == 2
    # Only that bank's account reads its history again.
    await db.refresh(conn)
    assert [a["synced"] for a in conn.accounts] == [False, True]
    assert [b["bank"] for b in await _banks(client, h)] == ["Nubank"]


async def test_unknown_bank_or_other_family_deletes_nothing(
    client: AsyncClient, db: AsyncSession
) -> None:
    h, _, _ = await _two_banks(client, db)
    r = await client.delete("/api/v1/transactions/bank?bank=Itaú&expected=0", headers=h)
    assert r.status_code == 404
    other = auth(await login(client, "token-partner-padded"))
    assert await _banks(client, other) == []
    r = await client.delete("/api/v1/transactions/bank?bank=Inter&expected=3", headers=other)
    assert r.status_code == 404
    assert (await client.get("/api/v1/transactions", headers=h)).json()["total"] == 7
    assert (await client.get("/api/v1/transactions/purge/banks")).status_code == 401
