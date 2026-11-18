from typing import Any

from httpx import AsyncClient

from tests.integration.conftest import auth, login
from tests.integration.test_overview_api import _import

CSV = (
    "Data,Valor,Identificador,Descrição\n"
    "03/10/2026,-200.00,id-1,Compra no débito - MERCADONA\n"
    "04/10/2026,-30.00,id-2,Compra no débito - LOJA DO BAIRRO\n"
)


async def _categories(client: AsyncClient, h: dict[str, str]) -> list[dict[str, Any]]:
    r = await client.get("/api/v1/categories", headers=h)
    assert r.status_code == 200, r.text
    data: list[dict[str, Any]] = r.json()
    return data


def _named(categories: list[dict[str, Any]], name: str) -> dict[str, Any]:
    return next(c for c in categories if c["name"] == name)


async def test_list_shows_defaults_with_counts(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, CSV, "nu.csv", "Nubank")
    categories = await _categories(client, h)
    mercado = _named(categories, "Mercado")
    assert mercado["kind"] == "expense"
    assert mercado["is_default"] is True
    assert mercado["transaction_count"] == 1
    assert mercado["rule_count"] == 0


async def test_create_rename_recolor_and_delete(client: AsyncClient) -> None:
    h = auth(await login(client))
    r = await client.post(
        "/api/v1/categories",
        json={"name": "  Pets ", "kind": "expense", "color": "#5F8F7B"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    pets = r.json()
    assert pets["name"] == "Pets"
    assert pets["color"] == "#5f8f7b"
    assert pets["is_default"] is False

    r = await client.patch(
        f"/api/v1/categories/{pets['id']}", json={"name": "Animais", "color": "#c7795a"}, headers=h
    )
    assert r.status_code == 200, r.text
    assert (r.json()["name"], r.json()["color"]) == ("Animais", "#c7795a")

    r = await client.delete(f"/api/v1/categories/{pets['id']}", headers=h)
    assert r.status_code == 204
    assert all(c["id"] != pets["id"] for c in await _categories(client, h))


async def test_repeated_name_is_refused(client: AsyncClient) -> None:
    h = auth(await login(client))
    r = await client.post(
        "/api/v1/categories",
        json={"name": "mercado", "kind": "expense", "color": "#5f8f7b"},
        headers=h,
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "Já existe uma categoria com esse nome."
    lazer = _named(await _categories(client, h), "Lazer")
    r = await client.patch(f"/api/v1/categories/{lazer['id']}", json={"name": "Mercado"}, headers=h)
    assert r.status_code == 409


async def test_bad_color_and_empty_name_are_refused(client: AsyncClient) -> None:
    h = auth(await login(client))
    for body in (
        {"name": "Pets", "kind": "expense", "color": "verde"},
        {"name": "   ", "kind": "expense", "color": "#5f8f7b"},
    ):
        r = await client.post("/api/v1/categories", json=body, headers=h)
        assert r.status_code == 422, body


async def test_renamed_default_still_gets_suggestions(client: AsyncClient) -> None:
    h = auth(await login(client))
    mercado = _named(await _categories(client, h), "Mercado")
    r = await client.patch(
        f"/api/v1/categories/{mercado['id']}", json={"name": "Supermercado"}, headers=h
    )
    assert r.status_code == 200
    await _import(client, h, CSV, "nu.csv", "Nubank")
    assert _named(await _categories(client, h), "Supermercado")["transaction_count"] == 1


async def test_deleting_leaves_transactions_without_category(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, CSV, "nu.csv", "Nubank")
    mercado = _named(await _categories(client, h), "Mercado")
    r = await client.delete(f"/api/v1/categories/{mercado['id']}", headers=h)
    assert r.status_code == 204
    r = await client.get("/api/v1/transactions?month=2026-10", headers=h)
    line = next(t for t in r.json()["items"] if "MERCADONA" in t["description"])
    assert line["category_id"] is None


async def test_rules_learned_for_a_category_can_be_removed(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, CSV, "nu.csv", "Nubank")
    lazer = _named(await _categories(client, h), "Lazer")
    r = await client.get("/api/v1/transactions?month=2026-10", headers=h)
    loja = next(t for t in r.json()["items"] if "LOJA" in t["description"])
    r = await client.patch(
        f"/api/v1/transactions/{loja['id']}",
        json={"category_id": lazer["id"], "apply_to_merchant": True},
        headers=h,
    )
    assert r.status_code == 200, r.text

    r = await client.get(f"/api/v1/categories/{lazer['id']}/rules", headers=h)
    assert r.status_code == 200
    [rule] = r.json()
    assert rule["merchant"] == "loja do bairro"
    assert _named(await _categories(client, h), "Lazer")["rule_count"] == 1

    r = await client.delete(f"/api/v1/categories/rules/{rule['id']}", headers=h)
    assert r.status_code == 204
    r = await client.get(f"/api/v1/categories/{lazer['id']}/rules", headers=h)
    assert r.json() == []


async def test_other_family_category_is_not_found(client: AsyncClient) -> None:
    h = auth(await login(client))
    mine = _named(await _categories(client, h), "Lazer")
    other = auth(await login(client, "token-partner-padded"))
    assert (
        await client.patch(f"/api/v1/categories/{mine['id']}", json={"name": "X"}, headers=other)
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/categories/{mine['id']}", headers=other)
    ).status_code == 404
    assert (
        await client.get(f"/api/v1/categories/{mine['id']}/rules", headers=other)
    ).status_code == 404


async def _summary(client: AsyncClient, h: dict[str, str]) -> dict[str, Any]:
    r = await client.get("/api/v1/transactions/summary?month=2026-10", headers=h)
    assert r.status_code == 200, r.text
    data: dict[str, Any] = r.json()
    return data


async def test_changing_the_kind_moves_its_lines_out_of_and_back_into_the_totals(
    client: AsyncClient,
) -> None:
    h = auth(await login(client))
    await _import(client, h, CSV, "nu.csv", "Nubank")
    mercado = _named(await _categories(client, h), "Mercado")
    before = await _summary(client, h)

    r = await client.patch(
        f"/api/v1/categories/{mercado['id']}", json={"kind": "transfer"}, headers=h
    )
    assert r.status_code == 200, r.text
    assert r.json()["kind"] == "transfer"
    r = await client.get(f"/api/v1/transactions?category_id={mercado['id']}", headers=h)
    assert {t["kind"] for t in r.json()["items"]} == {"transfer"}
    moved = await _summary(client, h)
    assert moved != before

    r = await client.patch(
        f"/api/v1/categories/{mercado['id']}", json={"kind": "expense"}, headers=h
    )
    assert r.status_code == 200, r.text
    r = await client.get(f"/api/v1/transactions?category_id={mercado['id']}", headers=h)
    assert {t["kind"] for t in r.json()["items"]} == {"regular"}
    assert await _summary(client, h) == before


async def test_changing_spending_to_income_keeps_the_lines_counted(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, CSV, "nu.csv", "Nubank")
    mercado = _named(await _categories(client, h), "Mercado")
    r = await client.patch(
        f"/api/v1/categories/{mercado['id']}", json={"kind": "income"}, headers=h
    )
    assert r.status_code == 200, r.text
    assert r.json()["kind"] == "income"
    r = await client.get(f"/api/v1/transactions?category_id={mercado['id']}", headers=h)
    assert {t["kind"] for t in r.json()["items"]} == {"regular"}
