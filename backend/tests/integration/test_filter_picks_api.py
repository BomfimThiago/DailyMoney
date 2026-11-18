"""Transações filters with several values per dimension, or hiding values ("Demais")."""

from typing import Any

from httpx import AsyncClient

from tests.integration.conftest import auth, login
from tests.integration.test_overview_api import DASHBOARD, OTHER_BANK_SPENDING, _get, _import

COUNTED = "kind=regular&kind=investment"
SPENT = f"month=2026-10&{COUNTED}&direction=out"


async def _totals(client: AsyncClient, h: dict[str, str], query: str) -> Any:
    return await _get(client, h, f"/api/v1/transactions/totals?{SPENT}&{query}")


def _spending(totals: Any) -> str:
    return totals["currencies"][0]["spending"] if totals["currencies"] else "0"


async def _dashboard(client: AsyncClient, h: dict[str, str]) -> Any:
    [brl] = (await _get(client, h, "/api/v1/transactions/dashboard?month=2026-10"))["currencies"]
    return brl


async def test_each_share_of_the_dashboard_opens_the_same_lines(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, DASHBOARD, "nu.csv", "Nubank")
    await _import(client, h, OTHER_BANK_SPENDING, "inter.csv", "Inter")
    dash = await _dashboard(client, h)
    params = {"categories": "category_id", "people": "member", "accounts": "account_id"}
    params["banks"] = "bank"
    for dimension, param in params.items():
        for share in dash[dimension]:
            totals = await _totals(client, h, f"{param}={share['key']}")
            assert float(_spending(totals)) == float(share["amount"]), (dimension, share)


async def test_several_categories_add_up_together(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, DASHBOARD, "nu.csv", "Nubank")
    top, second, *_ = (await _dashboard(client, h))["categories"]
    both = await _totals(client, h, f"category_id={top['key']}&category_id={second['key']}")
    assert float(_spending(both)) == float(top["amount"]) + float(second["amount"])
    listed = await _get(
        client,
        h,
        f"/api/v1/transactions?{SPENT}&category_id={top['key']}&category_id={second['key']}",
    )
    assert listed["total"] == both["count"]


async def test_hiding_the_biggest_shares_leaves_the_rest(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, DASHBOARD, "nu.csv", "Nubank")
    shares = (await _dashboard(client, h))["categories"]
    top, rest = shares[:2], shares[2:]
    hidden = "&".join(f"exclude_category_id={s['key']}" for s in top)
    totals = await _totals(client, h, hidden)
    assert float(_spending(totals)) == sum(float(s["amount"]) for s in rest)
    names = {g["name"] for g in totals["currencies"][0]["categories"]}
    assert names == {s["name"] for s in rest}


async def test_hiding_a_person_keeps_the_household(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, DASHBOARD, "nu.csv", "Nubank")
    me = (await _get(client, h, "/api/v1/family"))["members"][0]
    page = await _get(client, h, f"/api/v1/transactions?{SPENT}&q=uber")
    tx = page["items"][0]
    r = await client.patch(f"/api/v1/transactions/{tx['id']}", json={"member_id": None}, headers=h)
    assert r.status_code == 200, r.text
    # Lines with no Responsável (Casa) are not hidden with someone else.
    assert _spending(await _totals(client, h, f"exclude_member={me['id']}")) == "50.0000"
    assert _spending(await _totals(client, h, "exclude_member=casa")) == "1350.0000"
    both = await _totals(client, h, f"member={me['id']}&member=casa")
    assert _spending(both) == "1400.0000"


async def test_hiding_a_bank_and_an_account(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, DASHBOARD, "nu.csv", "Nubank")
    await _import(client, h, OTHER_BANK_SPENDING, "inter.csv", "Inter")
    dash = await _dashboard(client, h)
    total = sum(float(s["amount"]) for s in dash["accounts"])
    first = dash["accounts"][0]
    left = await _totals(client, h, f"exclude_account_id={first['key']}")
    assert float(_spending(left)) == total - float(first["amount"])
    bank = dash["banks"][0]
    left = await _totals(client, h, f"exclude_bank={bank['key']}")
    assert float(_spending(left)) == total - float(bank["amount"])


async def test_bad_filter_values_are_refused(client: AsyncClient) -> None:
    h = auth(await login(client))
    for query in ("category_id=abc", "exclude_member=ninguem", "account_id=none"):
        r = await client.get(f"/api/v1/transactions/totals?{query}", headers=h)
        assert r.status_code == 422, query
    # "none" is the lines with no category.
    r = await client.get("/api/v1/transactions?category_id=none", headers=h)
    assert r.status_code == 200
