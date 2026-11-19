from typing import Any

from httpx import AsyncClient

from tests.integration.conftest import auth, login
from tests.integration.test_overview_api import NUBANK, _get, _import

COUNTED = "kind=regular&kind=investment"


async def _totals(client: AsyncClient, h: dict[str, str], query: str) -> Any:
    return await _get(client, h, f"/api/v1/transactions/totals?month=2026-10&{COUNTED}&{query}")


async def test_totals_add_up_what_the_list_shows(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    totals = await _totals(client, h, "")
    # Five lines count: the Pix to self waits as a transfer and stays out, like in the list.
    assert totals["count"] == 5
    [brl] = totals["currencies"]
    assert brl["currency"] == "BRL"
    # The aplicação (R$ 1000) and the resgate (R$ 300) count by their net: R$ 700 out.
    assert (brl["income"], brl["spending"], brl["count"]) == ("5000.0000", "1050.0000", 5)
    assert (brl["invested_in"], brl["invested_out"]) == ("1000.0000", "300.0000")
    assert brl["balance"] == "3950.0000"
    page = await _get(client, h, f"/api/v1/transactions?month=2026-10&{COUNTED}")
    assert page["total"] == totals["count"]
    [nubank] = brl["accounts"]
    assert (nubank["name"], nubank["spending"], nubank["income"]) == (
        "Nubank",
        "1050.0000",
        "5000.0000",
    )
    invest = next(g for g in brl["categories"] if g["name"] == "Investimento")
    assert (invest["spending"], invest["income"], invest["count"]) == ("700.0000", "0", 2)
    assert (invest["invested_in"], invest["invested_out"]) == ("1000.0000", "300.0000")
    # Biggest spending first; each group knows how many lines it has.
    spent = [g["spending"] for g in brl["categories"]]
    assert spent == sorted(spent, key=float, reverse=True)
    assert sum(g["count"] for g in brl["categories"]) == 5


async def test_totals_follow_search_and_category(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    [brl] = (await _totals(client, h, "q=mercad"))["currencies"]
    assert (brl["income"], brl["spending"], brl["count"]) == ("0", "200.0000", 1)
    [category] = brl["categories"]
    [brl] = (await _totals(client, h, f"category_id={category['id']}"))["currencies"]
    assert [g["name"] for g in brl["categories"]] == [category["name"]]


async def test_totals_by_responsavel_with_the_household(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    me = (await _get(client, h, "/api/v1/family"))["members"][0]
    page = await _get(client, h, "/api/v1/transactions?month=2026-10&q=mercad")
    tx = page["items"][0]
    r = await client.patch(f"/api/v1/transactions/{tx['id']}", json={"member_id": None}, headers=h)
    assert r.status_code == 200, r.text

    [brl] = (await _totals(client, h, ""))["currencies"]
    by_member = {g["name"]: (g["id"], g["spending"]) for g in brl["members"]}
    assert by_member["Casa"] == (None, "200.0000")
    assert by_member[me["name"]] == (me["id"], "850.0000")

    casa = await _totals(client, h, "member=casa")
    assert casa["count"] == 1
    mine = await _totals(client, h, f"member={me['id']}")
    assert mine["count"] == 4
    listed = await _get(client, h, f"/api/v1/transactions?month=2026-10&{COUNTED}&member=casa")
    assert [t["id"] for t in listed["items"]] == [tx["id"]]
    r = await client.get("/api/v1/transactions/totals?member=ninguem", headers=h)
    assert r.status_code == 422


async def test_totals_empty_and_other_family(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    other = auth(await login(client, "token-partner-padded"))
    totals = await _get(client, other, "/api/v1/transactions/totals?month=2026-10")
    assert totals == {"count": 0, "currencies": []}


async def test_totals_when_more_came_back_than_went_in(client: AsyncClient) -> None:
    h = auth(await login(client))
    csv = (
        "Data,Valor,Identificador,Descrição\n"
        "05/10/2026,-100.00,id-1,Aplicação RDB\n"
        "10/10/2026,400.00,id-2,Resgate RDB\n"
    )
    await _import(client, h, csv, "nu.csv", "Nubank")
    [brl] = (await _totals(client, h, ""))["currencies"]
    # R$ 300 net came back: income, not R$ 100 of spending.
    assert (brl["income"], brl["spending"], brl["balance"]) == ("300.0000", "0", "300.0000")
    [invest] = brl["categories"]
    assert (invest["income"], invest["spending"]) == ("300.0000", "0")
