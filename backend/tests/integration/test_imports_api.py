from typing import Any

from httpx import AsyncClient

from tests.integration.conftest import auth, login

NUBANK = (
    "Data,Valor,Identificador,Descrição\n"
    "01/10/2026,2500.00,id-1,Transferência recebida - ACME\n"
    "03/10/2026,-45.20,id-2,Compra no débito - MERCADONA\n"
    "05/10/2026,-500.00,id-3,Pagamento de fatura\n"
    "08/10/2026,-29.90,id-4,Uber Trip\n"
)
NUBANK_CARD = (
    "date,title,amount\n2026-10-06,Netflix.com,39.90\n2026-10-06,Pagamento recebido,-500.00\n"
)


async def _upload(
    client: AsyncClient, h: dict[str, str], content: str, name: str = "nu.csv", **form: str
) -> dict[str, Any]:
    r = await client.post(
        "/api/v1/imports", files={"file": (name, content.encode())}, data=form, headers=h
    )
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


async def _confirm(
    client: AsyncClient, h: dict[str, str], import_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    r = await client.post(f"/api/v1/imports/{import_id}/confirm", json=body, headers=h)
    assert r.status_code == 200, r.text
    data: dict[str, Any] = r.json()
    return data


async def test_upload_preview_and_import(client: AsyncClient) -> None:
    h = auth(await login(client))
    preview = await _upload(client, h, NUBANK)
    assert preview["bank"] == "Nubank"
    assert preview["period_start"] == "2026-10-01"
    assert preview["period_end"] == "2026-10-08"
    [group] = preview["groups"]
    assert group == {
        "currency": "BRL",
        "account": None,
        "suggested_name": "Nubank BRL",
        "first_import": True,
        "counts": {"new": 4, "duplicate": 0, "skipped": 0},
    }
    by_desc = {r["description"]: r for r in preview["rows"]}
    assert by_desc["Uber Trip"]["category"] == "Transporte"
    assert by_desc["Compra no débito - MERCADONA"]["category"] == "Mercado"
    assert by_desc["Transferência recebida - ACME"]["category"] == "Renda"
    assert preview["rows"][0]["date"] == "2026-10-08"  # newest first

    # Nothing is saved before the person confirms.
    assert (await client.get("/api/v1/transactions", headers=h)).json()["total"] == 0

    summary = await _confirm(
        client,
        h,
        preview["id"],
        {"accounts": [{"currency": "BRL", "new_account": {"name": "Nubank"}}]},
    )
    assert summary["status"] == "imported"
    assert summary["imported_count"] == 4

    page = (await client.get("/api/v1/transactions", headers=h)).json()
    assert page["total"] == 4
    uber = next(t for t in page["items"] if t["description"] == "Uber Trip")
    assert uber["amount"] == "-29.9000"
    assert uber["account_name"] == "Nubank"
    assert uber["member_id"] is not None  # account owner = the person who uploaded

    accounts = (await client.get("/api/v1/accounts", headers=h)).json()
    assert [(a["name"], a["bank"], a["currency"]) for a in accounts] == [
        ("Nubank", "Nubank", "BRL")
    ]
    history = (await client.get("/api/v1/imports", headers=h)).json()
    assert [i["imported_count"] for i in history] == [4]


async def test_reupload_shows_duplicates_and_imports_only_new(client: AsyncClient) -> None:
    h = auth(await login(client))
    first = await _upload(client, h, NUBANK)
    await _confirm(
        client, h, first["id"], {"accounts": [{"currency": "BRL", "new_account": {"name": "Nu"}}]}
    )
    more = NUBANK + "09/10/2026,-10.00,id-5,Padaria Pao\n"
    second = await _upload(client, h, more)
    [group] = second["groups"]
    assert group["account"]["name"] == "Nu"  # same bank and currency: suggested
    assert group["first_import"] is False
    assert group["counts"] == {"new": 1, "duplicate": 4, "skipped": 0}
    summary = await _confirm(
        client,
        h,
        second["id"],
        {"accounts": [{"currency": "BRL", "account_id": group["account"]["id"]}]},
    )
    assert summary["imported_count"] == 1
    assert summary["duplicate_count"] == 4
    assert (await client.get("/api/v1/transactions", headers=h)).json()["total"] == 5


async def test_first_import_since_date_skips_older_rows(client: AsyncClient) -> None:
    h = auth(await login(client))
    up = await _upload(client, h, NUBANK)
    r = await client.post(
        f"/api/v1/imports/{up['id']}/preview", json={"since": "2026-10-05"}, headers=h
    )
    assert r.json()["groups"][0]["counts"]["skipped"] == 2
    summary = await _confirm(
        client,
        h,
        up["id"],
        {"accounts": [{"currency": "BRL", "new_account": {"name": "Nu"}}], "since": "2026-10-05"},
    )
    assert summary["imported_count"] == 2
    assert summary["skipped_count"] == 2


async def test_card_bill_payment_is_paired_as_transfer(client: AsyncClient) -> None:
    h = auth(await login(client))
    up = await _upload(client, h, NUBANK)
    await _confirm(
        client, h, up["id"], {"accounts": [{"currency": "BRL", "new_account": {"name": "Nu"}}]}
    )
    card = await _upload(client, h, NUBANK_CARD, name="fatura.csv")
    assert card["is_card"] is True
    [group] = card["groups"]
    assert group["suggested_name"] == "Nubank cartão"
    rows = {r["description"]: r for r in card["rows"]}
    assert rows["Pagamento recebido"]["kind"] == "transfer"
    assert rows["Pagamento recebido"]["category"] == "Transferência"
    assert rows["Netflix.com"]["category"] == "Assinaturas"
    assert rows["Netflix.com"]["amount"] == "-39.90"
    await _confirm(
        client,
        h,
        card["id"],
        {"accounts": [{"currency": "BRL", "new_account": {"name": "Nu cartão"}}]},
    )
    items = (await client.get("/api/v1/transactions", headers=h)).json()["items"]
    paid = next(t for t in items if t["description"] == "Pagamento de fatura")
    assert paid["kind"] == "transfer"
    assert paid["category_name"] == "Transferência"


async def test_file_without_currency_asks_for_it(client: AsyncClient) -> None:
    h = auth(await login(client))
    content = "Fecha;Concepto;Importe\n03/10/2026;LIDL;-12,00\n"
    up = await _upload(client, h, content, name="caixa.csv")
    assert up["needs_currency"] is True
    assert up["groups"] == []
    again = await _upload(client, h, content, name="caixa.csv", default_currency="EUR")
    assert again["needs_currency"] is False
    assert again["groups"][0]["currency"] == "EUR"
    assert again["groups"][0]["suggested_name"] == "Conta EUR"


async def test_unreadable_file_is_422(client: AsyncClient) -> None:
    h = auth(await login(client))
    r = await client.post("/api/v1/imports", files={"file": ("x.pdf", b"%PDF-1.7")}, headers=h)
    assert r.status_code == 422
    assert r.json()["code"] == "STATEMENT_UNREADABLE"


async def test_cancel_and_double_confirm(client: AsyncClient) -> None:
    h = auth(await login(client))
    up = await _upload(client, h, NUBANK)
    r = await client.post(f"/api/v1/imports/{up['id']}/cancel", headers=h)
    assert r.json()["status"] == "cancelled"
    r = await client.post(
        f"/api/v1/imports/{up['id']}/confirm",
        json={"accounts": [{"currency": "BRL", "new_account": {"name": "Nu"}}]},
        headers=h,
    )
    assert r.status_code == 409


async def test_choice_validation(client: AsyncClient) -> None:
    h = auth(await login(client))
    up = await _upload(client, h, NUBANK)
    r = await client.post(
        f"/api/v1/imports/{up['id']}/confirm",
        json={"accounts": [{"currency": "EUR", "new_account": {"name": "X"}}]},
        headers=h,
    )
    assert r.status_code == 422
    assert "BRL" in r.json()["detail"]
    r = await client.post(
        f"/api/v1/imports/{up['id']}/confirm",
        json={"accounts": [{"currency": "BRL"}]},
        headers=h,
    )
    assert r.status_code == 422


async def test_imports_of_another_family_are_not_found(client: AsyncClient) -> None:
    h = auth(await login(client))
    up = await _upload(client, h, NUBANK)
    other = auth(await login(client, "token-partner-padded"))
    r = await client.post(f"/api/v1/imports/{up['id']}/cancel", headers=other)
    assert r.status_code == 404
    assert (await client.get("/api/v1/transactions", headers=other)).json()["total"] == 0


async def test_change_category_and_learn_rule(client: AsyncClient) -> None:
    h = auth(await login(client))
    up = await _upload(client, h, NUBANK)
    await _confirm(
        client, h, up["id"], {"accounts": [{"currency": "BRL", "new_account": {"name": "Nu"}}]}
    )
    cats = {c["name"]: c["id"] for c in (await client.get("/api/v1/categories", headers=h)).json()}
    assert len(cats) == 10
    uber = next(
        t
        for t in (await client.get("/api/v1/transactions", headers=h)).json()["items"]
        if t["description"] == "Uber Trip"
    )
    r = await client.patch(
        f"/api/v1/transactions/{uber['id']}",
        json={"category_id": cats["Lazer"], "apply_to_merchant": True},
        headers=h,
    )
    assert r.status_code == 200
    assert r.json()["category_name"] == "Lazer"
    nxt = await _upload(
        client, h, "Data,Valor,Identificador,Descrição\n20/10/2026,-15.00,id-9,Uber Trip\n"
    )
    assert nxt["rows"][0]["category"] == "Lazer"
