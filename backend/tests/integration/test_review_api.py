"""Imported lines wait for the person's approval before they count (like the old app)."""

from typing import Any

from httpx import AsyncClient

from tests.integration.conftest import auth, login
from tests.integration.test_overview_api import INTER, NUBANK, _get

MONTH = "2026-10"


async def _import(client: AsyncClient, h: dict[str, str], content: str, name: str) -> Any:
    r = await client.post("/api/v1/imports", files={"file": (name, content.encode())}, headers=h)
    preview = r.json()
    accounts = [
        {"currency": g["currency"], "account_id": g["account"]["id"]}
        if g["account"]
        else {"currency": g["currency"], "new_account": {"name": name.split(".")[0]}}
        for g in preview["groups"]
    ]
    r = await client.post(
        f"/api/v1/imports/{preview['id']}/confirm", json={"accounts": accounts}, headers=h
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _decide(
    client: AsyncClient, h: dict[str, str], ids: list[str], decision: str
) -> dict[str, Any]:
    r = await client.post(
        "/api/v1/transactions/review", json={"ids": ids, "decision": decision}, headers=h
    )
    assert r.status_code == 200, r.text
    data: dict[str, Any] = r.json()
    return data


async def _queue(client: AsyncClient, h: dict[str, str]) -> list[dict[str, Any]]:
    queue = await _get(client, h, "/api/v1/transactions/review")
    return [t for g in queue["groups"] for t in g["items"]]


async def test_imported_lines_count_only_after_approval(client: AsyncClient) -> None:
    h = auth(await login(client))
    summary = await _import(client, h, NUBANK, "nu.csv")
    assert (summary["imported_count"], summary["to_review"]) == (7, 7)

    # Nothing counts yet: no lines, no figures, no spending per day.
    assert (await _get(client, h, f"/api/v1/transactions?month={MONTH}"))["total"] == 0
    summary = await _get(client, h, f"/api/v1/transactions/summary?month={MONTH}")
    assert summary["to_review"] == 7
    assert summary["pending_transfers"] == 0
    [brl] = summary["currencies"]
    assert (brl["income"], brl["spending"], brl["invested"]) == ("0", "0", "0")
    dashboard = await _get(client, h, f"/api/v1/transactions/dashboard?month={MONTH}")
    assert dashboard["currencies"][0]["categories"] == []

    queue = await _get(client, h, "/api/v1/transactions/review")
    [group] = queue["groups"]
    assert (queue["total"], group["label"], group["source"]) == (7, "nu.csv", "statement")
    assert all(t["review"] == "pending" for t in group["items"])
    assert group["items"][0]["date"] == "2026-10-20"  # newest first

    by_desc = {t["description"]: t for t in group["items"]}
    mercadona = by_desc["Compra no débito - MERCADONA"]
    result = await _decide(client, h, [mercadona["id"]], "approve")
    assert result == {"count": 1, "left": 6}

    page = await _get(client, h, f"/api/v1/transactions?month={MONTH}")
    assert [(t["description"], t["review"]) for t in page["items"]] == [
        ("Compra no débito - MERCADONA", "approved")
    ]
    summary = await _get(client, h, f"/api/v1/transactions/summary?month={MONTH}")
    assert (summary["currencies"][0]["spending"], summary["to_review"]) == ("200.0000", 6)

    # Approving again changes nothing.
    assert await _decide(client, h, [mercadona["id"]], "approve") == {"count": 0, "left": 6}


async def test_rejected_lines_stay_out_even_when_read_again(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv")
    items = await _queue(client, h)
    salary = next(t for t in items if t["description"].startswith("Transferência recebida"))
    assert await _decide(client, h, [salary["id"]], "reject") == {"count": 1, "left": 6}
    await _decide(client, h, [t["id"] for t in items if t["id"] != salary["id"]], "approve")

    summary = await _get(client, h, f"/api/v1/transactions/summary?month={MONTH}")
    # Without the salary only the resgate is income; the rest still counts as approved.
    brl = summary["currencies"][0]
    assert (brl["income"], brl["spending"], summary["to_review"]) == ("300.0000", "1350.0000", 0)
    page = await _get(client, h, f"/api/v1/transactions?month={MONTH}&limit=200")
    assert salary["id"] not in [t["id"] for t in page["items"]]

    # The same statement again: the turned-down line is known, so it doesn't come back.
    again = await _import(client, h, NUBANK, "nu.csv")
    assert again["imported_count"] == 0
    assert (await _get(client, h, "/api/v1/transactions/review"))["total"] == 0


async def test_rejecting_one_side_breaks_the_transfer(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv")
    await _decide(client, h, [t["id"] for t in await _queue(client, h)], "approve")
    await _import(client, h, INTER, "inter.csv")
    [inter] = await _queue(client, h)
    assert inter["kind"] == "transfer"

    await _decide(client, h, [inter["id"]], "reject")
    transfers = await _get(client, h, f"/api/v1/transactions/transfers?month={MONTH}")
    # The Nubank side goes back to waiting for the person to say what it was.
    assert [t["description"] for t in transfers["pending"]] == [
        "Transferência enviada pelo Pix - THIAGO BOMFIM - 123"
    ]
    assert transfers["confirmed"] == []


async def test_review_can_be_turned_off(client: AsyncClient) -> None:
    h = auth(await login(client))
    family = await _get(client, h, "/api/v1/family")
    assert family["review_imports"] is True

    r = await client.patch("/api/v1/family", json={"review_imports": False}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["review_imports"] is False

    summary = await _import(client, h, NUBANK, "nu.csv")
    assert summary["to_review"] == 0
    assert (await _get(client, h, "/api/v1/transactions/review"))["total"] == 0
    assert (await _get(client, h, f"/api/v1/transactions?month={MONTH}"))["total"] == 6


async def test_another_family_cannot_decide(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv")
    ids = [t["id"] for t in await _queue(client, h)]

    other = auth(await login(client, "token-partner-padded"))
    assert (await _get(client, other, "/api/v1/transactions/review"))["total"] == 0
    assert await _decide(client, other, ids, "approve") == {"count": 0, "left": 0}
    assert (await _get(client, h, "/api/v1/transactions/review"))["total"] == 7


async def test_decision_needs_lines_and_a_known_answer(client: AsyncClient) -> None:
    h = auth(await login(client))
    for body in ({"ids": [], "decision": "approve"}, {"ids": [], "decision": "maybe"}):
        r = await client.post("/api/v1/transactions/review", json=body, headers=h)
        assert r.status_code == 422


async def test_saying_what_a_waiting_line_was_approves_it(client: AsyncClient) -> None:
    """Marking a line still in "Para revisar" as entre minhas contas is the person's review:
    it leaves the queue and shows up in Transferências."""
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv")
    queue = await _queue(client, h)
    pix = next(t for t in queue if t["description"] == "Pix enviado - Fulano de Tal")

    r = await client.put(
        f"/api/v1/transactions/{pix['id']}/kind", json={"kind": "transfer"}, headers=h
    )
    assert r.status_code == 200, r.text
    assert (r.json()["kind"], r.json()["review"]) == ("transfer", "approved")

    assert pix["id"] not in [t["id"] for t in await _queue(client, h)]
    transfers = await _get(client, h, f"/api/v1/transactions/transfers?month={MONTH}")
    assert [t["id"] for t in transfers["confirmed"]] == [pix["id"]]
