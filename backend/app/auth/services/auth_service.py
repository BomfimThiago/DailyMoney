import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import RefreshToken
from app.auth.schemas import TokenPair
from app.auth.services.google import GoogleIdentity
from app.categories.services import category_service
from app.core.config import settings
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import create_access_token, hash_token, new_refresh_token
from app.families.models import Family, Member, User

# How long a refresh token already traded in is still accepted.
REFRESH_REUSE_SECONDS = 60


async def login_with_google(db: AsyncSession, identity: GoogleIdentity) -> User:
    if identity.email not in settings.ALLOWED_EMAILS:
        raise ForbiddenError("Esta conta Google não tem acesso ao Daily Money")

    user = await db.scalar(select(User).where(User.google_sub == identity.sub))
    if user is None:
        user = await db.scalar(select(User).where(User.email == identity.email))
    if user is None:
        user = await _create_user_with_family(
            db, identity.email, identity.name, identity.sub, identity.picture
        )
    else:
        user.google_sub = identity.sub
        user.email = identity.email
        user.picture_url = identity.picture
    user.last_login_at = datetime.now(UTC)
    await db.flush()
    return user


async def login_with_email(db: AsyncSession, email: str) -> User:
    email = email.lower()
    if email not in settings.ALLOWED_EMAILS:
        raise ForbiddenError("Este e-mail não tem acesso ao Daily Money")
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        name = email.split("@")[0].split(".")[0].capitalize()
        user = await _create_user_with_family(db, email, name, None, None)
    user.last_login_at = datetime.now(UTC)
    await db.flush()
    return user


async def _create_user_with_family(
    db: AsyncSession, email: str, name: str, google_sub: str | None, picture: str | None
) -> User:
    first_name = name.split()[0]
    family = Family(name=f"Família de {first_name}")
    db.add(family)
    await db.flush()
    user = User(
        family_id=family.id,
        email=email,
        google_sub=google_sub,
        name=name,
        picture_url=picture,
    )
    db.add(user)
    await db.flush()
    db.add(Member(family_id=family.id, name=first_name, user_id=user.id))
    category_service.seed_defaults(db, family.id)
    return user


async def issue_tokens(db: AsyncSession, user_id: uuid.UUID) -> TokenPair:
    raw = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=hash_token(raw),
            expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_DAYS),
        )
    )
    await db.flush()
    return TokenPair(access_token=create_access_token(user_id), refresh_token=raw)


async def refresh_tokens(db: AsyncSession, raw: str) -> TokenPair:
    stored = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)).with_for_update()
    )
    now = datetime.now(UTC)
    if stored is None or stored.expires_at <= now or _traded_in_long_ago(stored, now):
        raise UnauthorizedError("Sessão expirada, entre de novo")
    # Rotation: each refresh token works once, so a stolen copy dies on next legitimate use.
    stored.revoked_at = stored.revoked_at or now
    return await issue_tokens(db, stored.user_id)


def _traded_in_long_ago(stored: RefreshToken, now: datetime) -> bool:
    """A token just traded in still works for a moment: two tabs refreshing together, or
    a reply lost on the way, must not sign the person out."""
    if stored.revoked_at is None:
        return False
    return now - stored.revoked_at >= timedelta(seconds=REFRESH_REUSE_SECONDS)


async def logout(db: AsyncSession, raw: str) -> None:
    stored = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    if stored is not None:
        now = datetime.now(UTC)
        stored.revoked_at = stored.revoked_at or now
        # Signing out ends the token at once, with no moment of reuse.
        stored.expires_at = min(stored.expires_at, now)
        await db.flush()
