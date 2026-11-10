from typing import Any

from httpx import AsyncClient

from tests.integration.conftest import auth, login

# The logged-in user is "Thiago Bomfim" (conftest).
NUBANK = (
    "Data,Valor,Identificador,Descrição\n"
    "01/10/2026,5000.00,id-1,Transferência recebida - ACME\n"
    "03/10/2026,-200.00,id-2,Compra no débito - MERCADONA\n"
    "05/10/2026,-1000.00,id-3,Aplicação RDB\n"
    "10/10/2026,300.00,id-4,Resgate RDB\n"
    "12/10/2026,-800.00,id-5,Transferência enviada pelo Pix - THIAGO BOMFIM - 123\n"
    "20/10/2026,-150.00,id-6,Pix enviado - Fulano de Tal\n"
    "15/09/2026,-400.00,id-7,Aplicação RDB\n"
)
INTER = (
    " Extrato Conta Corrente \n"
    "Conta ;12345678\n"
    "Período ;01/10/2026 a 31/10/2026\n"
    "\n"
    "Data Lançamento;Histórico;Descrição;Valor;Saldo\n"
    "13/10/2026;Pix recebido;Thiago Bomfim;800,00;800,00\n"
)
WISE_HEADER = (
    '"TransferWise ID",Date,"Date Time",Amount,Currency,Description,"Payment Reference",'
    '"Running Balance","Exchange From","Exchange To","Exchange Rate","Payer Name","Payee Name",'
    '"Payee Account Number",Merchant,"Card Last Four Digits","Card Holder Full Name",Attachment,'
    'Note,"Total fees","Exchange To Amount","Transaction Type","Transaction Details Type"'
)
WISE_BRL = (
    WISE_HEADER + "\n"
    'BALANCE-1,09-10-2026,"09-10-2026 10:00:00.000",-1000.00,BRL,"Converted 1,000.00 BRL to '
    '182.48 USD",,0.00,BRL,USD,0.18248,,,,,,,,,0.00,182.48,DEBIT,CONVERSION\n'
)
WISE_USD = (
    WISE_HEADER + "\n"
    'BALANCE-1,09-10-2026,"09-10-2026 10:00:00.000",182.48,USD,"Converted 1,000.00 BRL to '
    '182.48 USD",,182.48,BRL,USD,0.18248,,,,,,,,,0.00,182.48,CREDIT,CONVERSION\n'
)


async def _import(
    client: AsyncClient, h: dict[str, str], content: str, name: str, account: str
) -> dict[str, Any]:
    r = await client.post("/api/v1/imports", files={"file": (name, content.encode())}, headers=h)
    assert r.status_code == 201, r.text
    preview: dict[str, Any] = r.json()
    accounts = [
        {"currency": g["currency"], "new_account": {"name": account}} for g in preview["groups"]
    ]
    r = await client.post(
        f"/api/v1/imports/{preview['id']}/confirm", json={"accounts": accounts}, headers=h
    )
    assert r.status_code == 200, r.text
    return preview


async def _get(client: AsyncClient, h: dict[str, str], path: str) -> Any:
    r = await client.get(path, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


async def test_import_sorts_investments_and_pix_to_self(client: AsyncClient) -> None:
    h = auth(await login(client))
    preview = await _import(client, h, NUBANK, "nu.csv", "Nubank")
    kinds = {r["description"]: (r["kind"], r["category"]) for r in preview["rows"]}
    assert kinds["Aplicação RDB"] == ("investment", None)
    assert kinds["Resgate RDB"] == ("investment", None)
    assert kinds["Transferência enviada pelo Pix - THIAGO BOMFIM - 123"] == ("pending", None)
    assert kinds["Pix enviado - Fulano de Tal"][0] == "regular"

    summary = await _get(client, h, "/api/v1/transactions/summary?month=2026-10")
    assert summary["pending_transfers"] == 1
    [brl] = summary["currencies"]
    assert brl == {
        "currency": "BRL",
        "income": "5000.0000",
        "spending": "350.0000",
        "invested": "700.0000",
        "invested_in": "1000.0000",
        "invested_out": "300.0000",
        "left": "3950.0000",
    }


async def test_investments_by_product(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    inv = await _get(client, h, "/api/v1/transactions/investments?month=2026-10")
    assert inv["totals"] == [
        {"currency": "BRL", "put_in": "1400.0000", "taken_out": "300.0000", "net": "1100.0000"}
    ]
    [product] = inv["products"]
    assert (product["name"], product["account_name"], product["currency"]) == (
        "RDB",
        "Nubank",
        "BRL",
    )
    assert (product["put_in"], product["taken_out"], product["net"], product["month_net"]) == (
        "1400.0000",
        "300.0000",
        "1100.0000",
        "700.0000",
    )
    assert [m["description"] for m in inv["movements"]] == ["Resgate RDB", "Aplicação RDB"]
    assert [(m["month"], m["net"]) for m in inv["history"]][-2:] == [
        ("2026-09", "400.0000"),
        ("2026-10", "700.0000"),
    ]
    assert len(inv["history"]) == 6


async def test_other_side_imported_later_pairs_the_pending_pix(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    preview = await _import(client, h, INTER, "inter.csv", "Inter")
    assert [r["kind"] for r in preview["rows"]] == ["transfer"]

    transfers = await _get(client, h, "/api/v1/transactions/transfers?month=2026-10")
    assert transfers["pending"] == []
    [pair] = transfers["confirmed"]
    assert (pair["kind"], pair["from_account"], pair["to_account"], pair["amount"]) == (
        "pair",
        "Nubank",
        "Inter",
        "800.0000",
    )
    summary = await _get(client, h, "/api/v1/transactions/summary?month=2026-10")
    assert summary["pending_transfers"] == 0


async def test_confirm_pending_as_spending_or_own_transfer(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    transfers = await _get(client, h, "/api/v1/transactions/transfers?month=2026-10")
    [pending] = transfers["pending"]

    r = await client.put(
        f"/api/v1/transactions/{pending['id']}/kind", json={"kind": "regular"}, headers=h
    )
    assert r.status_code == 200, r.text
    assert (r.json()["kind"], r.json()["category_name"]) == ("regular", "Outros")
    summary = await _get(client, h, "/api/v1/transactions/summary?month=2026-10")
    assert summary["currencies"][0]["spending"] == "1150.0000"

    r = await client.put(
        f"/api/v1/transactions/{pending['id']}/kind", json={"kind": "transfer"}, headers=h
    )
    assert (r.json()["kind"], r.json()["category_name"]) == ("transfer", "Transferência")
    transfers = await _get(client, h, "/api/v1/transactions/transfers?month=2026-10")
    [single] = transfers["confirmed"]
    assert (single["kind"], single["from_account"], single["to_account"]) == (
        "single",
        "Nubank",
        None,
    )


async def test_breaking_and_remaking_a_pair(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    await _import(client, h, INTER, "inter.csv", "Inter")
    items = (await _get(client, h, "/api/v1/transactions?kind=transfer"))["items"]
    sent = next(t for t in items if t["account_name"] == "Nubank")
    received = next(t for t in items if t["account_name"] == "Inter")

    # Saying one side was spending breaks the pair; the other side waits again.
    await client.put(f"/api/v1/transactions/{sent['id']}/kind", json={"kind": "regular"}, headers=h)
    transfers = await _get(client, h, "/api/v1/transactions/transfers?month=2026-10")
    assert [p["id"] for p in transfers["pending"]] == [received["id"]]

    # The side called spending is never pulled back into a pair by the other one.
    await client.put(
        f"/api/v1/transactions/{received['id']}/kind", json={"kind": "transfer"}, headers=h
    )
    [single] = (await _get(client, h, "/api/v1/transactions/transfers?month=2026-10"))["confirmed"]
    assert (single["kind"], single["from_account"], single["to_account"]) == (
        "single",
        None,
        "Inter",
    )

    # Calling it a transfer again finds the other side and pairs them.
    await client.put(
        f"/api/v1/transactions/{sent['id']}/kind", json={"kind": "transfer"}, headers=h
    )
    [pair] = (await _get(client, h, "/api/v1/transactions/transfers?month=2026-10"))["confirmed"]
    assert (pair["kind"], pair["from_account"], pair["to_account"]) == ("pair", "Nubank", "Inter")


async def test_currency_exchange_shows_both_sides(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, WISE_BRL, "wise-brl.csv", "Wise BRL")
    await _import(client, h, WISE_USD, "wise-usd.csv", "Wise USD")
    [exchange] = (await _get(client, h, "/api/v1/transactions/transfers?month=2026-10"))[
        "confirmed"
    ]
    assert exchange["kind"] == "exchange"
    assert (exchange["amount"], exchange["currency"]) == ("1000.0000", "BRL")
    assert (exchange["to_amount"], exchange["to_currency"]) == ("182.4800", "USD")
    assert (exchange["from_account"], exchange["to_account"]) == ("Wise BRL", "Wise USD")
    summary = await _get(client, h, "/api/v1/transactions/summary?month=2026-10")
    assert [c["currency"] for c in summary["currencies"]] == ["BRL", "USD"]
    assert all(c["spending"] == "0" and c["income"] == "0" for c in summary["currencies"])


async def test_list_filters_and_bad_month(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    page = await _get(client, h, "/api/v1/transactions?month=2026-10&kind=investment")
    assert page["total"] == 2
    found = await _get(client, h, "/api/v1/transactions?month=2026-10&q=mercad")
    assert [t["description"] for t in found["items"]] == ["Compra no débito - MERCADONA"]
    # Wildcards in the search box are plain characters.
    assert (await _get(client, h, "/api/v1/transactions?q=%25"))["total"] == 0
    tx = found["items"][0]
    by_cat = await _get(client, h, f"/api/v1/transactions?category_id={tx['category_id']}")
    assert tx["id"] in [t["id"] for t in by_cat["items"]]
    assert all(t["category_id"] == tx["category_id"] for t in by_cat["items"])
    r = await client.get("/api/v1/transactions/summary?month=2026-13", headers=h)
    assert r.status_code == 422
    r = await client.get("/api/v1/transactions/summary?month=octubre", headers=h)
    assert r.status_code == 422


async def test_other_family_cannot_change_kind(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nubank")
    tx = (await _get(client, h, "/api/v1/transactions?limit=1"))["items"][0]
    other = auth(await login(client, "token-partner-padded"))
    r = await client.put(
        f"/api/v1/transactions/{tx['id']}/kind", json={"kind": "regular"}, headers=other
    )
    assert r.status_code == 404
    r = await client.put(
        f"/api/v1/transactions/{tx['id']}/kind", json={"kind": "pending"}, headers=h
    )
    assert r.status_code == 422


DASHBOARD = (
    "Data,Valor,Identificador,Descrição\n"
    "01/10/2026,5000.00,id-1,Transferência recebida - ACME\n"
    "03/10/2026,-200.00,id-2,Compra no débito - MERCADONA\n"
    "03/10/2026,-50.00,id-3,Compra no débito - UBER\n"
    "20/10/2026,-150.00,id-4,Pix enviado - Fulano de Tal\n"
    "05/10/2026,-1000.00,id-5,Aplicação RDB\n"
    "28/09/2026,-80.00,id-6,Compra no débito - FARMACIA\n"
)


async def test_dashboard_spending_by_day_category_and_account(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, DASHBOARD, "nu.csv", "Nubank")

    dash = await _get(client, h, "/api/v1/transactions/dashboard?month=2026-10")
    [brl] = dash["currencies"]
    daily = [float(v) for v in brl["daily"]]
    previous = [float(v) for v in brl["previous_daily"]]
    # Income and the investment stay out; only money spent counts.
    assert len(daily) == 31 and len(previous) == 30
    assert daily[2] == 250 and daily[19] == 150 and sum(daily) == 400
    assert previous[27] == 80 and sum(previous) == 80
    assert sum(float(c["amount"]) for c in brl["categories"]) == 400
    amounts = [float(c["amount"]) for c in brl["categories"]]
    assert amounts == sorted(amounts, reverse=True)
    assert brl["accounts"] == [{"name": "Nubank", "amount": "400.0000"}]

    empty = await _get(client, h, "/api/v1/transactions/dashboard?month=2026-12")
    assert sum(float(v) for v in empty["currencies"][0]["daily"]) == 0


ANALYSIS = (
    "Data,Valor,Identificador,Descrição\n"
    "01/10/2026,5000.00,a-1,Transferência recebida - ACME\n"
    "02/10/2026,-12.00,a-2,Compra no débito - UBER TRIP\n"
    "09/10/2026,-12.00,a-3,Compra no débito - UBER TRIP\n"
    "16/10/2026,-14.00,a-4,Compra no débito - UBER TRIP\n"
    "12/10/2026,-55.90,a-5,Compra no débito - NETFLIX\n"
    "12/09/2026,-55.90,a-6,Compra no débito - NETFLIX\n"
    "20/09/2026,-100.00,a-7,Compra no débito - MERCADONA\n"
    "05/10/2026,-1000.00,a-8,Aplicação RDB\n"
)


async def test_analysis_by_month_with_habits_peaks_and_subscriptions(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, ANALYSIS, "nu.csv", "Nubank")

    data = await _get(client, h, "/api/v1/transactions/analysis?month=2026-10&months=3")
    assert (data["month"], data["months"]) == ("2026-10", 3)
    [brl] = data["currencies"]
    # Income and the investment are not spending.
    assert [(m["month"], m["amount"]) for m in brl["months"]] == [
        ("2026-08", "0"),
        ("2026-09", "155.9000"),
        ("2026-10", "93.9000"),
    ]
    assert brl["average"] == "155.9000"
    [uber] = brl["habits"]
    assert (uber["name"], uber["category"], uber["count"]) == ("Uber Trip", "Transporte", 3)
    assert brl["peaks"][0] == {
        "date": "2026-10-12",
        "amount": "55.9000",
        "merchants": ["Netflix"],
    }
    [netflix] = brl["recurring"]
    assert (netflix["name"], netflix["amount"], netflix["months"]) == ("Netflix", "55.9000", 2)
    assert len(brl["weekdays"]) == 7


async def test_analysis_rejects_long_periods(client: AsyncClient) -> None:
    h = auth(await login(client))
    r = await client.get("/api/v1/transactions/analysis?month=2026-10&months=13", headers=h)
    assert r.status_code == 422
    r = await client.get("/api/v1/transactions/analysis?month=2026-10")
    assert r.status_code == 401
