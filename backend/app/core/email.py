import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.core.exceptions import AppError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    html: str
    text: str


EmailSender = Callable[[Email], Awaitable[None]]


class EmailError(AppError):
    status_code = 503
    code = "EMAIL_UNAVAILABLE"


async def send_email(email: Email) -> None:
    if not settings.RESEND_API_KEY:
        if not settings.DEBUG:
            raise EmailError("Envio de e-mail não configurado")
        logger.warning("email not sent (no RESEND_API_KEY), subject=%s", email.subject)
        print(f"\n--- e-mail para {email.to} ---\n{email.text}\n", flush=True)
        return
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json={
                "from": settings.SENDER_EMAIL,
                "to": [email.to],
                "subject": email.subject,
                "html": email.html,
                "text": email.text,
            },
        )
    if response.status_code >= 300:
        logger.error("resend failed status=%s body=%s", response.status_code, response.text[:300])
        raise EmailError("Não foi possível enviar o e-mail agora. Tente de novo.")


def get_email_sender() -> EmailSender:
    return send_email
