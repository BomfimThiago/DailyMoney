from httpx import AsyncClient

from tests.integration.conftest import auth, login


async def test_ask_for_a_bank_and_see_the_request(client: AsyncClient) -> None:
    h = auth(await login(client))
    r = await client.post(
        "/api/v1/bank-requests",
        json={"bank_name": "  Santander ", "note": "conta e cartão"},
        headers=h,
    )
    assert r.status_code == 201
    asked = r.json()
    assert asked["bank_name"] == "Santander"
    assert asked["note"] == "conta e cartão"

    listed = (await client.get("/api/v1/bank-requests", headers=h)).json()
    assert [b["bank_name"] for b in listed] == ["Santander"]


async def test_asking_twice_for_the_same_bank_keeps_one_request(client: AsyncClient) -> None:
    h = auth(await login(client))
    first = await client.post("/api/v1/bank-requests", json={"bank_name": "BBVA"}, headers=h)
    again = await client.post("/api/v1/bank-requests", json={"bank_name": "bbva"}, headers=h)
    assert again.status_code == 201
    assert again.json()["id"] == first.json()["id"]
    assert len((await client.get("/api/v1/bank-requests", headers=h)).json()) == 1


async def test_bank_name_is_required_and_short(client: AsyncClient) -> None:
    h = auth(await login(client))
    for name in ["", "   ", "x" * 81]:
        r = await client.post("/api/v1/bank-requests", json={"bank_name": name}, headers=h)
        assert r.status_code == 422, name


async def test_requests_belong_to_the_family(client: AsyncClient) -> None:
    thiago = auth(await login(client))
    await client.post("/api/v1/bank-requests", json={"bank_name": "Itaú"}, headers=thiago)
    partner = auth(await login(client, "token-partner-padded"))
    assert (await client.get("/api/v1/bank-requests", headers=partner)).json() == []
    assert (await client.get("/api/v1/bank-requests")).status_code == 401
