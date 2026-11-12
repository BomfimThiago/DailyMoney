import subprocess
import sys
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.auth.services.google import GoogleIdentity, get_google_verifier
from app.core.config import settings
from app.core.email import Email, get_email_sender
from app.db.session import get_db
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def migrated_db() -> None:
    # The interpreter running the tests, not whatever "alembic" is first on PATH: tools
    # such as crapper and mutator call .venv/bin/python directly.
    alembic = [sys.executable, "-m", "alembic"]
    subprocess.run([*alembic, "downgrade", "base"], check=True, capture_output=True)
    subprocess.run([*alembic, "upgrade", "head"], check=True, capture_output=True)


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(
            bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        try:
            yield session
        finally:
            await session.close()
            await trans.rollback()
    await engine.dispose()


IDENTITIES = {
    "token-thiago-padded": GoogleIdentity(
        sub="google-sub-thiago", email="thiago@example.com", name="Thiago Bomfim", picture=None
    ),
    "token-partner-padded": GoogleIdentity(
        sub="google-sub-partner", email="partner@example.com", name="Ana", picture=None
    ),
    "token-stranger-padded": GoogleIdentity(
        sub="google-sub-stranger", email="stranger@example.com", name="Stranger", picture=None
    ),
}


async def fake_verifier(token: str) -> GoogleIdentity:
    from app.core.exceptions import UnauthorizedError

    if token not in IDENTITIES:
        raise UnauthorizedError("Login do Google inválido")
    return IDENTITIES[token]


@pytest.fixture
def outbox() -> list[Email]:
    return []


@pytest.fixture
async def client(db: AsyncSession, outbox: list[Email]) -> AsyncIterator[AsyncClient]:
    async def _send(email: Email) -> None:
        outbox.append(email)

    async def _get_db() -> AsyncIterator[AsyncSession]:
        yield db

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_google_verifier] = lambda: fake_verifier
    app.dependency_overrides[get_email_sender] = lambda: _send
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def login(client: AsyncClient, token: str = "token-thiago-padded") -> dict[str, str]:
    response = await client.post("/api/v1/auth/google", json={"id_token": token})
    assert response.status_code == 200, response.text
    data: dict[str, str] = response.json()
    return data


def auth(tokens: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}
