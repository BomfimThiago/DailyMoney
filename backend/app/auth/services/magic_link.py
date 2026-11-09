from datetime import UTC, datetime, timedelta
from html import escape
from urllib.parse import quote

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import MagicLinkToken
from app.core.config import settings
from app.core.email import Email, EmailSender
from app.core.exceptions import AppError, UnauthorizedError
from app.core.security import hash_token, new_refresh_token


class TooManyRequestsError(AppError):
    status_code = 429
    code = "RATE_LIMITED"


async def request_link(db: AsyncSession, email: str, send: EmailSender) -> None:
    email = email.lower()
    # Same answer for unknown addresses, so the endpoint doesn't reveal who has access.
    if email not in settings.ALLOWED_EMAILS:
        return
    now = datetime.now(UTC)
    window_start = now - timedelta(minutes=settings.MAGIC_LINK_MINUTES)
    recent = await db.scalar(
        select(func.count())
        .select_from(MagicLinkToken)
        .where(MagicLinkToken.email == email, MagicLinkToken.created_at >= window_start)
    )
    if (recent or 0) >= settings.MAGIC_LINK_MAX_PER_WINDOW:
        raise TooManyRequestsError("Muitos links pedidos. Espere alguns minutos.")

    raw = new_refresh_token()
    db.add(
        MagicLinkToken(
            email=email,
            token_hash=hash_token(raw),
            expires_at=now + timedelta(minutes=settings.MAGIC_LINK_MINUTES),
        )
    )
    await db.flush()
    await send(build_email(email, raw))


def build_email(to: str, raw_token: str) -> Email:
    link = f"{settings.APP_URL.rstrip('/')}/entrar?token={quote(raw_token)}"
    minutes = settings.MAGIC_LINK_MINUTES
    html = (
        '<div style="font-family:Helvetica,Arial,sans-serif;color:#2b2840;max-width:420px">'
        '<p style="font-size:18px;font-weight:600;margin:0 0 16px">Daily Money</p>'
        '<p style="font-size:15px;line-height:22px;margin:0 0 24px">'
        "Toque no botão para entrar. O link vale por "
        f"{minutes} minutos e só funciona uma vez.</p>"
        f'<a href="{escape(link)}" style="display:inline-block;background:#2b2840;color:#fff;'
        'text-decoration:none;padding:12px 20px;border-radius:999px;font-size:15px">'
        "Entrar no Daily Money</a>"
        '<p style="font-size:13px;color:#8a8799;margin:24px 0 0">'
        "Se não foi você que pediu, ignore este e-mail.</p></div>"
    )
    text = (
        f"Entre no Daily Money com este link (vale {minutes} minutos, uso único):\n{link}\n\n"
        "Se não foi você que pediu, ignore este e-mail."
    )
    return Email(to=to, subject="Seu link para entrar no Daily Money", html=html, text=text)


async def consume_link(db: AsyncSession, raw: str) -> str:
    stored = await db.scalar(
        select(MagicLinkToken).where(MagicLinkToken.token_hash == hash_token(raw)).with_for_update()
    )
    now = datetime.now(UTC)
    if stored is None or stored.used_at is not None or stored.expires_at <= now:
        raise UnauthorizedError("Este link expirou ou já foi usado. Peça um novo.")
    stored.used_at = now
    await db.flush()
    return stored.email
