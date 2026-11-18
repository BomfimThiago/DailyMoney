"""Transações as in the old app: any period, type and currency filters, sorting, day
totals, the month with the latest lines and a line's value in every currency."""

from typing import Any

from httpx import AsyncClient

from tests.integration.conftest import auth, login
from tests.integration.test_fx_api import FakeEcb, ecb  # noqa: F401
from tests.integration.test_overview_api import NUBANK, WISE_USD, _get, _import

COUNTED = "kind=regular&kind=investment"


async def _list(client: AsyncClient, h: dict[str, str], query: str) -> Any:
    return await _get(client, h, f"/api/v1/transactions?{COUNTED}&limit=50&{query}")


def _amounts(page: Any) -> list[str]:
    return [t["amount"] for t in page["items"]]


async def test_any_period_from_to_or_everything(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    span = await _list(client, h, "date_from=2026-09-01&date_to=2026-10-04")
    assert [t["date"] for t in span["items"]] == ["2026-10-03", "2026-10-01", "2026-09-15"]
    assert (await _list(client, h, ""))["total"] == 6
    totals = await _get(client, h, f"/api/v1/transactions/totals?{COUNTED}&date_from=2026-10-02")
    assert totals["count"] == 4
    r = await client.get("/api/v1/transactions?date_from=2026-10-05&date_to=2026-10-01", headers=h)
    assert r.status_code == 422


async def test_type_and_account_currency(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    out = await _list(client, h, "month=2026-10&direction=out")
    assert sorted(_amounts(out)) == ["-1000.0000", "-150.0000", "-200.0000"]
    into = await _list(client, h, "month=2026-10&direction=in")
    assert sorted(_amounts(into)) == ["300.0000", "5000.0000"]
    [brl] = (
        await _get(client, h, f"/api/v1/transactions/totals?{COUNTED}&month=2026-10&direction=in")
    )["currencies"]
    assert (brl["income"], brl["spending"]) == ("5300.0000", "0")
    assert (await _list(client, h, "month=2026-10&account_currency=BRL"))["total"] == 5
    assert (await _list(client, h, "month=2026-10&account_currency=USD"))["total"] == 0


async def test_sort_by_description_or_amount(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    by_amount = await _list(client, h, "month=2026-10&sort=amount")
    assert _amounts(by_amount) == ["-1000.0000", "-200.0000", "-150.0000", "300.0000", "5000.0000"]
    assert _amounts(await _list(client, h, "month=2026-10&sort=-amount"))[0] == "5000.0000"
    names = [
        t["description"]
        for t in (await _list(client, h, "month=2026-10&sort=description"))["items"]
    ]
    assert names == sorted(names, key=str.lower)
    desc = await _list(client, h, "month=2026-10&sort=-description")
    assert [t["description"] for t in desc["items"]] == names[::-1]
    r = await client.get("/api/v1/transactions?sort=valor", headers=h)
    assert r.status_code == 422


async def test_sort_by_amount_in_the_chosen_currency(
    client: AsyncClient,
    ecb: FakeEcb,  # noqa: F811
) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    await _import(client, h, WISE_USD, "wise-usd.csv", "Wise USD")
    q = f"{COUNTED}&kind=transfer&month=2026-10&currency=BRL&sort=-amount"
    page = await _get(client, h, f"/api/v1/transactions?{q}&limit=3")
    # US$ 182,48 is R$ 912,40: above the R$ 300 line once converted, not below it.
    assert [t["display_amount"] for t in page["items"]] == ["5000.0000", "912.4000", "300.0000"]
    nxt = await _get(client, h, f"/api/v1/transactions?{q}&limit=1&offset=1")
    assert [t["currency"] for t in nxt["items"]] == ["USD"]
    assert nxt["total"] == page["total"]


async def test_day_totals_and_transfers_never_count(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    # Showing the waiting Pix in the list does not put it in the totals.
    q = f"{COUNTED}&kind=pending&kind=transfer&month=2026-10"
    assert (await _get(client, h, f"/api/v1/transactions?{q}"))["total"] == 6
    totals = await _get(client, h, f"/api/v1/transactions/totals?{q}")
    assert totals["count"] == 5
    days = {d["date"]: d["total"] for d in totals["currencies"][0]["days"]}
    assert days["2026-10-03"] == "-200.0000"
    assert days["2026-10-01"] == "5000.0000"
    assert "2026-10-12" not in days


async def test_latest_month_with_lines(client: AsyncClient) -> None:
    h = auth(await login(client))
    assert await _get(client, h, "/api/v1/transactions/latest-month") == {"month": None}
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    assert await _get(client, h, "/api/v1/transactions/latest-month") == {"month": "2026-10"}


async def test_a_line_in_every_currency(
    client: AsyncClient,
    ecb: FakeEcb,  # noqa: F811
) -> None:  # noqa: F811
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    tx = (await _list(client, h, "q=mercad"))["items"][0]
    out = await _get(client, h, f"/api/v1/transactions/{tx['id']}/currencies")
    # Weekends keep the last published rate, stored under their own day.
    assert out["rate_date"] == "2026-10-03"
    by = {a["currency"]: (a["amount"], a["rate"]) for a in out["amounts"]}
    # R$ 600 = € 100 = US$ 120.
    assert by["BRL"] == ("-200.0000", "1")
    assert by["EUR"] == ("-33.3333", "0.16666667")
    assert by["USD"] == ("-40.0000", "0.20000000")
    other = auth(await login(client, "token-partner-padded"))
    r = await client.get(f"/api/v1/transactions/{tx['id']}/currencies", headers=other)
    assert r.status_code == 404
