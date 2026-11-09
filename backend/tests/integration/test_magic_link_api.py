import re
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import MagicLinkToken
from app.core.email import Email
from tests.integration.conftest import auth


def token_from(email: Email) -> str:
    match = re.search(r"/entrar\?token=([\w-]+)", email.text)
    assert match, email.text
    return match.group(1)


async def request(client: AsyncClient, email: str) -> int:
    r = await client.post("/api/v1/auth/magic-link", json={"email": email})
    return r.status_code


async def test_allowed_email_gets_link_and_signs_in(
    client: AsyncClient, outbox: list[Email]
) -> None:
    assert await request(client, "Thiago@Example.com") == 202
    assert len(outbox) == 1
    assert outbox[0].to == "thiago@example.com"
    assert "http://localhost:8081/entrar?token=" in outbox[0].text

    r = await client.post("/api/v1/auth/magic-link/verify", json={"token": token_from(outbox[0])})
    assert r.status_code == 200
    me = (await client.get("/api/v1/auth/me", headers=auth(r.json()))).json()
    assert me["email"] == "thiago@example.com"
    assert me["family"]["name"] == "Família de Thiago"
    assert [m["name"] for m in me["family"]["members"]] == ["Thiago"]


async def test_unknown_email_gets_same_answer_and_no_email(
    client: AsyncClient, outbox: list[Email]
) -> None:
    assert await request(client, "stranger@example.com") == 202
    assert outbox == []


async def test_link_works_only_once(client: AsyncClient, outbox: list[Email]) -> None:
    await request(client, "thiago@example.com")
    body = {"token": token_from(outbox[0])}
    assert (await client.post("/api/v1/auth/magic-link/verify", json=body)).status_code == 200
    assert (await client.post("/api/v1/auth/magic-link/verify", json=body)).status_code == 401


async def test_expired_link_rejected(
    client: AsyncClient, outbox: list[Email], db: AsyncSession
) -> None:
    await request(client, "thiago@example.com")
    await db.execute(
        update(MagicLinkToken).values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
    )
    r = await client.post("/api/v1/auth/magic-link/verify", json={"token": token_from(outbox[0])})
    assert r.status_code == 401


async def test_invented_token_rejected(client: AsyncClient) -> None:
    r = await client.post("/api/v1/auth/magic-link/verify", json={"token": "x" * 40})
    assert r.status_code == 401


async def test_too_many_links_rate_limited(client: AsyncClient, outbox: list[Email]) -> None:
    for _ in range(3):
        assert await request(client, "thiago@example.com") == 202
    assert await request(client, "thiago@example.com") == 429
    assert len(outbox) == 3


async def test_email_login_and_google_login_share_the_same_user(
    client: AsyncClient, outbox: list[Email]
) -> None:
    await request(client, "thiago@example.com")
    r = await client.post("/api/v1/auth/magic-link/verify", json={"token": token_from(outbox[0])})
    by_email = (await client.get("/api/v1/auth/me", headers=auth(r.json()))).json()
    g = await client.post("/api/v1/auth/google", json={"id_token": "token-thiago-padded"})
    by_google = (await client.get("/api/v1/auth/me", headers=auth(g.json()))).json()
    assert by_email["id"] == by_google["id"]


async def test_invalid_email_is_422(client: AsyncClient) -> None:
    assert await request(client, "not-an-email") == 422
