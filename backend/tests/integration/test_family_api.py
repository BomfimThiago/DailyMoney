from httpx import AsyncClient

from tests.integration.conftest import auth, login


async def test_add_rename_and_remove_member(client: AsyncClient) -> None:
    h = auth(await login(client))
    r = await client.post("/api/v1/family/members", json={"name": "Ana"}, headers=h)
    assert r.status_code == 201
    ana = r.json()
    assert ana["user_id"] is None
    assert ana["color"].startswith("#")

    r = await client.patch(
        f"/api/v1/family/members/{ana['id']}", json={"name": "Ana Paula"}, headers=h
    )
    assert r.json()["name"] == "Ana Paula"

    assert (
        await client.delete(f"/api/v1/family/members/{ana['id']}", headers=h)
    ).status_code == 204
    family = (await client.get("/api/v1/family", headers=h)).json()
    assert [m["name"] for m in family["members"]] == ["Thiago"]


async def test_duplicate_member_name_conflicts(client: AsyncClient) -> None:
    h = auth(await login(client))
    await client.post("/api/v1/family/members", json={"name": "Ana"}, headers=h)
    r = await client.post("/api/v1/family/members", json={"name": "Ana"}, headers=h)
    assert r.status_code == 409


async def test_member_with_login_cannot_be_removed(client: AsyncClient) -> None:
    h = auth(await login(client))
    me = (await client.get("/api/v1/family", headers=h)).json()["members"][0]
    assert (await client.delete(f"/api/v1/family/members/{me['id']}", headers=h)).status_code == 409


async def test_other_family_member_is_not_found(client: AsyncClient) -> None:
    thiago = auth(await login(client))
    ana = (await client.post("/api/v1/family/members", json={"name": "Ana"}, headers=thiago)).json()
    # The partner signing in alone gets their own family until invites exist.
    partner = auth(await login(client, "token-partner-padded"))
    r = await client.patch(
        f"/api/v1/family/members/{ana['id']}", json={"name": "X"}, headers=partner
    )
    assert r.status_code == 404
    assert (
        await client.delete(f"/api/v1/family/members/{ana['id']}", headers=partner)
    ).status_code == 404


async def test_update_display_currency_and_month_start(client: AsyncClient) -> None:
    h = auth(await login(client))
    r = await client.patch(
        "/api/v1/family", json={"display_currency": "EUR", "month_start_day": 5}, headers=h
    )
    assert r.status_code == 200
    assert r.json()["display_currency"] == "EUR"
    assert r.json()["month_start_day"] == 5


async def test_invalid_family_update_rejected(client: AsyncClient) -> None:
    h = auth(await login(client))
    assert (
        await client.patch("/api/v1/family", json={"display_currency": "GBP"}, headers=h)
    ).status_code == 422
    assert (
        await client.patch("/api/v1/family", json={"month_start_day": 31}, headers=h)
    ).status_code == 422
    bad_color = {"name": "Ana", "color": "red"}
    assert (
        await client.post("/api/v1/family/members", json=bad_color, headers=h)
    ).status_code == 422
