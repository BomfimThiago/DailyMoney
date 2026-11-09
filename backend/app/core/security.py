import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import settings
from app.core.exceptions import UnauthorizedError


def create_access_token(user_id: uuid.UUID, now: datetime | None = None) -> str:
    issued = now or datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": issued,
        "exp": issued + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> uuid.UUID:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("Token inválido ou expirado") from exc
    if payload.get("type") != "access":
        raise UnauthorizedError("Token inválido ou expirado")
    try:
        return uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise UnauthorizedError("Token inválido ou expirado") from exc


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(raw: str) -> str:
    # Refresh tokens are stored hashed so a database leak doesn't hand out sessions.
    return hashlib.sha256(raw.encode()).hexdigest()
