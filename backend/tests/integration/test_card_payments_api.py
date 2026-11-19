"""Paying the card bill: its own category, out of spending unless the card isn't in the app."""

from typing import Any

from httpx import AsyncClient

from tests.integration.conftest import auth, login
from tests.integration.test_imports_api import NUBANK, NUBANK_CARD, _confirm, _upload

CARD = "Pago de Cartão de Crédito"


async def _import(
    client: AsyncClient, h: dict[str, str], content: str, name: str, acc: str
) -> None:
    up = await _upload(client, h, content, name=name)
    await _confirm(
        client, h, up["id"], {"accounts": [{"currency": "BRL", "new_account": {"name": acc}}]}
    )


async def _items(client: AsyncClient, h: dict[str, str]) -> dict[str, Any]:
    items = (await client.get("/api/v1/transactions", headers=h)).json()["items"]
    return {t["description"]: t for t in items}


async def _spending(client: AsyncClient, h: dict[str, str]) -> str:
    r = await client.get("/api/v1/transactions/summary?month=2026-10", headers=h)
    [brl] = r.json()["currencies"]
    return str(brl["spending"])


async def _categories(client: AsyncClient, h: dict[str, str]) -> dict[str, Any]:
    return {c["name"]: c for c in (await client.get("/api/v1/categories", headers=h)).json()}


async def test_every_family_has_the_category(client: AsyncClient) -> None:
    h = auth(await login(client))
    card = (await _categories(client, h))[CARD]
    assert card["kind"] == "transfer"
    assert card["is_default"] is True
    assert card["key"] == CARD


async def test_payment_with_the_card_in_the_app_is_not_spending(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nu")
    await _import(client, h, NUBANK_CARD, "fatura.csv", "Nu cartão")
    items = await _items(client, h)
    for side in ("Pagamento de fatura", "Pagamento recebido"):
        assert (items[side]["kind"], items[side]["category_name"]) == ("transfer", CARD)
    # Mercadona 45.20 + Uber 29.90 + the card's Netflix 39.90 and sofa 120.
    assert await _spending(client, h) == "235.0000"


async def test_payment_of_a_card_not_in_the_app_counts(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nu")
    paid = (await _items(client, h))["Pagamento de fatura"]
    # The card's purchases are nowhere else in the app: the payment is that spending.
    assert (paid["kind"], paid["category_name"]) == ("regular", CARD)
    assert await _spending(client, h) == "575.1000"
    # Once the card comes in, its purchases count and the payment leaves spending.
    await _import(client, h, NUBANK_CARD, "fatura.csv", "Nu cartão")
    paid = (await _items(client, h))["Pagamento de fatura"]
    assert (paid["kind"], paid["category_name"]) == ("transfer", CARD)
    assert await _spending(client, h) == "235.0000"


async def test_choosing_the_category_takes_the_line_out_when_the_card_is_known(
    client: AsyncClient,
) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nu")
    card_id = (await _categories(client, h))[CARD]["id"]
    uber = (await _items(client, h))["Uber Trip"]
    r = await client.patch(
        f"/api/v1/transactions/{uber['id']}",
        json={"category_id": card_id, "apply_to_merchant": False},
        headers=h,
    )
    assert r.status_code == 200, r.text
    # No Nubank card in the app yet: it stays counted.
    assert r.json()["kind"] == "regular"
    await _import(client, h, NUBANK_CARD, "fatura.csv", "Nu cartão")
    uber = (await _items(client, h))["Uber Trip"]
    assert (uber["kind"], uber["category_name"]) == ("transfer", CARD)


async def test_calling_a_bill_payment_a_transfer_names_it(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _import(client, h, NUBANK, "nu.csv", "Nu")
    paid = (await _items(client, h))["Pagamento de fatura"]
    cats = await _categories(client, h)
    # The person files it under Outros, then says it was money moving.
    await client.patch(
        f"/api/v1/transactions/{paid['id']}",
        json={"category_id": cats["Outros"]["id"], "apply_to_merchant": False},
        headers=h,
    )
    r = await client.put(
        f"/api/v1/transactions/{paid['id']}/kind", json={"kind": "transfer"}, headers=h
    )
    assert r.status_code == 200, r.text
    assert (r.json()["kind"], r.json()["category_name"]) == ("transfer", CARD)
    # Taken out of the card payment on purpose ("Entre minhas contas"), it stays a plain
    # transfer.
    r = await client.put(
        f"/api/v1/transactions/{paid['id']}/kind", json={"kind": "transfer"}, headers=h
    )
    assert r.json()["category_name"] == "Transferência"


async def test_the_category_never_turns_into_spending(client: AsyncClient) -> None:
    h = auth(await login(client))
    card_id = (await _categories(client, h))[CARD]["id"]
    r = await client.patch(f"/api/v1/categories/{card_id}", json={"kind": "expense"}, headers=h)
    assert r.status_code == 409
    # A new name is fine; the app still knows it.
    r = await client.patch(f"/api/v1/categories/{card_id}", json={"name": "Fatura"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["key"] == CARD


async def test_paying_a_store_card_counts_even_with_the_banks_own_card_in_the_app(
    client: AsyncClient,
) -> None:
    h = auth(await login(client))
    store = NUBANK + "09/10/2026,-29.21,id-5,Pagamento efetuado|MIDWAY\n"
    await _import(client, h, store, "nu.csv", "Nu")
    await _import(client, h, NUBANK_CARD, "fatura.csv", "Nu cartão")
    card_id = (await _categories(client, h))[CARD]["id"]
    midway = (await _items(client, h))["Pagamento efetuado|MIDWAY"]
    r = await client.patch(
        f"/api/v1/transactions/{midway['id']}",
        json={"category_id": card_id, "apply_to_merchant": False},
        headers=h,
    )
    # The Midway card's purchases are nowhere in the app: the payment is that spending.
    assert (r.json()["kind"], r.json()["category_name"]) == ("regular", CARD)
    assert await _spending(client, h) == "264.2100"
