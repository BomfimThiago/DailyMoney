import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.core.config import settings
from app.core.exceptions import UnauthorizedError

_GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str
    picture: str | None


GoogleVerifier = Callable[[str], Awaitable[GoogleIdentity]]


def identity_from_claims(claims: dict[str, Any], allowed_audiences: list[str]) -> GoogleIdentity:
    if claims.get("iss") not in _GOOGLE_ISSUERS:
        raise UnauthorizedError("Login do Google inválido")
    if not allowed_audiences or claims.get("aud") not in allowed_audiences:
        raise UnauthorizedError("Login do Google inválido")
    if not claims.get("email_verified"):
        raise UnauthorizedError("O e-mail da conta Google não está verificado")
    email = str(claims.get("email", "")).lower()
    if not email or not claims.get("sub"):
        raise UnauthorizedError("Login do Google inválido")
    return GoogleIdentity(
        sub=str(claims["sub"]),
        email=email,
        name=str(claims.get("name") or email.split("@")[0]),
        picture=claims.get("picture"),
    )


async def verify_google_id_token(token: str) -> GoogleIdentity:
    def _verify() -> dict[str, Any]:
        # audience=None: the audience is checked against every platform's client id below.
        claims: dict[str, Any] = google_id_token.verify_oauth2_token(  # type: ignore[no-untyped-call]
            token, google_requests.Request(), audience=None
        )
        return claims

    try:
        claims = await asyncio.to_thread(_verify)
    except ValueError as exc:
        raise UnauthorizedError("Login do Google inválido") from exc
    return identity_from_claims(claims, settings.GOOGLE_CLIENT_IDS)


def get_google_verifier() -> GoogleVerifier:
    return verify_google_id_token
