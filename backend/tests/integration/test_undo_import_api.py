from typing import Any

from httpx import AsyncClient

from tests.integration.conftest import approve_all, auth, login
from tests.integration.test_imports_api import NUBANK, NUBANK_CARD, _confirm, _upload

NEW_NU = {"accounts": [{"currency": "BRL", "new_account": {"name": "Nu"}}]}


async def _history(client: AsyncClient, h: dict[str, str]) -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = (await client.get("/api/v1/imports", headers=h)).json()
    return data


async def _total(client: AsyncClient, h: dict[str, str]) -> int:
    total: int = (await client.get("/api/v1/transactions", headers=h)).json()["total"]
    return total


async def test_history_counts_lines_still_in_the_app(client: AsyncClient) -> None:
    h = auth(await login(client))
    up = await _upload(client, h, NUBANK)
    await _confirm(client, h, up["id"], NEW_NU)
    items = (await client.get("/api/v1/transactions", headers=h)).json()["items"]
    await client.delete(f"/api/v1/transactions/{items[0]['id']}", headers=h)
    [entry] = await _history(client, h)
    assert entry["imported_count"] == 4
    assert entry["lines"] == 3


async def test_undo_removes_the_import_and_its_lines(client: AsyncClient) -> None:
    h = auth(await login(client))
    first = await _upload(client, h, NUBANK)
    await _confirm(client, h, first["id"], NEW_NU)
    more = await _upload(client, h, "Data,Valor,Identificador,Descrição\n09/10/2026,-10,id-5,Pao\n")
    account_id = more["groups"][0]["account"]["id"]
    await _confirm(
        client, h, more["id"], {"accounts": [{"currency": "BRL", "account_id": account_id}]}
    )
    assert await _total(client, h) == 5

    r = await client.post(f"/api/v1/imports/{first['id']}/undo", headers=h)
    assert r.status_code == 200, r.text
    assert r.json() == {"removed": 4}
    items = (await client.get("/api/v1/transactions", headers=h)).json()["items"]
    assert [t["description"] for t in items] == ["Pao"]
    assert [i["id"] for i in await _history(client, h)] == [more["id"]]
    # Gone for good: undoing again is not found.
    r = await client.post(f"/api/v1/imports/{first['id']}/undo", headers=h)
    assert r.status_code == 404


async def test_undo_takes_waiting_and_rejected_lines_too(client: AsyncClient) -> None:
    h = auth(await login(client))
    up = await _upload(client, h, NUBANK)
    r = await client.post(f"/api/v1/imports/{up['id']}/confirm", json=NEW_NU, headers=h)
    assert r.json()["to_review"] == 4
    queue = (await client.get("/api/v1/transactions/review", headers=h)).json()
    first_id = queue["groups"][0]["items"][0]["id"]
    await client.post(
        "/api/v1/transactions/review", json={"ids": [first_id], "decision": "reject"}, headers=h
    )
    r = await client.post(f"/api/v1/imports/{up['id']}/undo", headers=h)
    assert r.json() == {"removed": 4}
    assert (await client.get("/api/v1/transactions/review", headers=h)).json()["groups"] == []
    # Sent again, every line is new (nothing kept as a duplicate or a rejection).
    again = await _upload(client, h, NUBANK)
    assert again["groups"][0]["counts"] == {"new": 4, "duplicate": 0, "skipped": 0}


async def test_undo_leaves_the_other_side_of_a_transfer_waiting(client: AsyncClient) -> None:
    h = auth(await login(client))
    up = await _upload(client, h, NUBANK)
    await _confirm(client, h, up["id"], NEW_NU)
    card = await _upload(client, h, NUBANK_CARD, name="fatura.csv")
    await _confirm(
        client, h, card["id"], {"accounts": [{"currency": "BRL", "new_account": {"name": "Card"}}]}
    )
    await client.post(f"/api/v1/imports/{card['id']}/undo", headers=h)
    transfers = (await client.get("/api/v1/transactions/transfers?month=2026-10", headers=h)).json()
    assert [t["description"] for t in transfers["pending"]] == ["Pagamento de fatura"]


async def test_reread_replaces_the_old_lines_only_on_confirm(client: AsyncClient) -> None:
    h = auth(await login(client))
    first = await _upload(client, h, NUBANK)
    await _confirm(client, h, first["id"], NEW_NU)
    fixed = NUBANK.replace("Uber Trip", "Uber Trip SP")
    again = await _upload(client, h, fixed, replaces=first["id"])
    [group] = again["groups"]
    # The old reading doesn't count: every line is new and the account is suggested.
    assert group["counts"] == {"new": 4, "duplicate": 0, "skipped": 0}
    assert group["account"]["name"] == "Nu"
    assert group["first_import"] is False

    # Cancelling keeps the old reading.
    await client.post(f"/api/v1/imports/{again['id']}/cancel", headers=h)
    assert await _total(client, h) == 4

    again = await _upload(client, h, fixed, replaces=first["id"])
    refreshed = await client.post(
        f"/api/v1/imports/{again['id']}/preview", json={"replaces": first["id"]}, headers=h
    )
    assert refreshed.json()["groups"][0]["counts"]["new"] == 4
    body = {
        "accounts": [{"currency": "BRL", "account_id": group["account"]["id"]}],
        "replaces": first["id"],
    }
    summary = await _confirm(client, h, again["id"], body)
    assert summary["imported_count"] == 4
    items = (await client.get("/api/v1/transactions", headers=h)).json()["items"]
    assert sorted(t["description"] for t in items)[-1] == "Uber Trip SP"
    assert len(items) == 4
    assert [i["id"] for i in await _history(client, h)] == [again["id"]]


async def test_undo_rules(client: AsyncClient) -> None:
    h = auth(await login(client))
    up = await _upload(client, h, NUBANK)
    # Not imported yet: nothing to undo, and it can't be re-read either.
    r = await client.post(f"/api/v1/imports/{up['id']}/undo", headers=h)
    assert r.status_code == 409
    r = await client.post(
        "/api/v1/imports",
        files={"file": ("nu.csv", NUBANK.encode())},
        data={"replaces": up["id"]},
        headers=h,
    )
    assert r.status_code == 409
    await _confirm(client, h, up["id"], NEW_NU)
    other = auth(await login(client, "token-partner-padded"))
    r = await client.post(f"/api/v1/imports/{up['id']}/undo", headers=other)
    assert r.status_code == 404
    assert await _total(client, h) == 4
    await approve_all(client, h)
