from httpx import AsyncClient

from tests.integration.conftest import auth, login
from tests.integration.test_fx_api import FakeEcb, ecb  # noqa: F401
from tests.integration.test_imports_api import NUBANK, NUBANK_CARD, _confirm, _upload


async def _nubank_and_card(client: AsyncClient, h: dict[str, str], card: bool) -> None:
    up = await _upload(client, h, NUBANK)
    await _confirm(
        client, h, up["id"], {"accounts": [{"currency": "BRL", "new_account": {"name": "Nu"}}]}
    )
    if card:
        c = await _upload(client, h, NUBANK_CARD, name="fatura.csv")
        await _confirm(
            client, h, c["id"], {"accounts": [{"currency": "BRL", "new_account": {"name": "C"}}]}
        )


async def test_bill_payment_with_both_sides_closes(client: AsyncClient) -> None:
    h = auth(await login(client))
    await _nubank_and_card(client, h, card=True)
    r = await client.get("/api/v1/transactions/movements?month=2026-10", headers=h)
    assert r.status_code == 200, r.text
    [group] = r.json()["groups"]
    assert group["currency"] == "BRL"
    assert group["result"] == "closed"
    assert group["went_out"] == "500.0000"
    assert group["came_in"] == "500.0000"
    [row] = group["rows"]
    assert row["name"] == "Transferência"
    assert row["count"] == 2


async def test_side_not_in_the_app_did_not_come_back(client: AsyncClient, ecb: FakeEcb) -> None:  # noqa: F811
    h = auth(await login(client))
    await _nubank_and_card(client, h, card=False)
    items = (await client.get("/api/v1/transactions", headers=h)).json()["items"]
    paid = next(t for t in items if t["description"] == "Pagamento de fatura")
    await client.put(
        f"/api/v1/transactions/{paid['id']}/kind", json={"kind": "transfer"}, headers=h
    )
    r = await client.get("/api/v1/transactions/movements?month=2026-10&currency=EUR", headers=h)
    [group] = r.json()["groups"]
    assert group["currency"] == "EUR"
    assert group["result"] == "out"
    assert group["came_in"] == "0"
    # R$ 500 at 6 reais per euro.
    assert group["net"] == "-83.3333"
    # Other months have nothing.
    r = await client.get("/api/v1/transactions/movements?month=2026-09", headers=h)
    assert r.json() == {"month": "2026-09", "groups": []}
