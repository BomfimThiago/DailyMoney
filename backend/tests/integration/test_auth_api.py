from httpx import AsyncClient

from tests.integration.conftest import auth, login


async def test_first_login_creates_family_with_only_the_user(client: AsyncClient) -> None:
    tokens = await login(client)
    me = (await client.get("/api/v1/auth/me", headers=auth(tokens))).json()
    assert me["email"] == "thiago@example.com"
    assert me["family"]["name"] == "Família de Thiago"
    assert me["family"]["display_currency"] == "BRL"
    assert [m["name"] for m in me["family"]["members"]] == ["Thiago"]
    assert me["family"]["members"][0]["user_id"] == me["id"]


async def test_second_login_reuses_the_same_user_and_family(client: AsyncClient) -> None:
    first = (await client.get("/api/v1/auth/me", headers=auth(await login(client)))).json()
    second = (await client.get("/api/v1/auth/me", headers=auth(await login(client)))).json()
    assert first["id"] == second["id"]
    assert len(second["family"]["members"]) == 1


async def test_email_not_on_allow_list_is_forbidden(client: AsyncClient) -> None:
    r = await client.post("/api/v1/auth/google", json={"id_token": "token-stranger-padded"})
    assert r.status_code == 403
    assert r.json()["code"] == "FORBIDDEN"


async def test_invalid_google_token_is_unauthorized(client: AsyncClient) -> None:
    r = await client.post("/api/v1/auth/google", json={"id_token": "not-a-real-token"})
    assert r.status_code == 401


async def test_protected_route_without_token(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    bad = {"Authorization": "Bearer nonsense"}
    assert (await client.get("/api/v1/auth/me", headers=bad)).status_code == 401


async def test_refresh_rotates_and_old_token_stops_working(client: AsyncClient) -> None:
    tokens = await login(client)
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    new = r.json()
    assert new["refresh_token"] != tokens["refresh_token"]
    assert (await client.get("/api/v1/auth/me", headers=auth(new))).status_code == 200
    again = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert again.status_code == 401


async def test_logout_revokes_refresh_token(client: AsyncClient) -> None:
    tokens = await login(client)
    body = {"refresh_token": tokens["refresh_token"]}
    assert (await client.post("/api/v1/auth/logout", json=body)).status_code == 204
    assert (await client.post("/api/v1/auth/refresh", json=body)).status_code == 401


async def test_unknown_refresh_token_is_unauthorized(client: AsyncClient) -> None:
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": "x" * 40})
    assert r.status_code == 401
