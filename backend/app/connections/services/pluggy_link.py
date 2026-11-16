"""Connecting a Brazilian bank from the app, through Meu Pluggy.

The app opens Pluggy's own window (Pluggy Connect) with a key made here. In it the person
goes to Meu Pluggy, picks a bank and authorizes it; that makes an "item" at Pluggy, and
the app tells the server its id. Pluggy may still be reading the bank at that point (or
the person may close the window), so the item waits here as pending and becomes a
connection the next time anyone looks: the return page or the Conexões page.
"""

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.models import BankConnection, PendingPluggyItem
from app.connections.services import pluggy, sync_service
from app.connections.services.enablebanking import NotConfiguredError
from app.core.config import settings
from app.core.exceptions import AppError, NotFoundError
from app.families.models import User

log = logging.getLogger(__name__)

# Where Meu Pluggy sends the person when its page can't close itself (phone browsers).
CALLBACK_PATH = "/conexoes/retorno-brasil"
# An authorization nobody finished stops waiting.
GIVE_UP_AFTER = timedelta(hours=1)


@dataclass
class Settled:
    connected: list[BankConnection] = field(default_factory=list)
    waiting: int = 0
    failed: int = 0


def redirect_url() -> str:
    return settings.APP_URL.rstrip("/") + CALLBACK_PATH


async def start(db: AsyncSession, user: User) -> str:
    """The key that opens Pluggy's window for this family to authorize one more bank."""
    if not pluggy.enabled():
        raise NotConfiguredError("Bancos do Brasil ainda não foram configurados no servidor.")
    # Attempts left behind don't pile up at Pluggy, which allows few connections.
    await settle(db, user.family_id)
    return await pluggy.create_connect_token(redirect_url(), str(user.family_id))


async def register(db: AsyncSession, user: User, item_id: str) -> None:
    """Pluggy's window made an item for this family: it waits here until it can be read."""
    item = await pluggy.get_item(item_id)
    if item.get("clientUserId") != str(user.family_id):
        # Made for another family, or by hand outside the app.
        raise NotFoundError("Conexão não encontrada")
    known = await db.scalar(
        select(PendingPluggyItem.id).where(
            PendingPluggyItem.family_id == user.family_id, PendingPluggyItem.item_id == item_id
        )
    ) or await db.scalar(
        select(BankConnection.id).where(
            BankConnection.family_id == user.family_id,
            BankConnection.provider == pluggy.PROVIDER,
            BankConnection.external_id == item_id,
        )
    )
    if known is None:
        db.add(PendingPluggyItem(family_id=user.family_id, user_id=user.id, item_id=item_id))
        await db.flush()


async def settle(db: AsyncSession, family_id: uuid.UUID) -> Settled:
    """Every authorization the family finished becomes a connection; dead ones go away."""
    result = Settled()
    rows = await db.scalars(
        select(PendingPluggyItem)
        .where(PendingPluggyItem.family_id == family_id)
        .order_by(PendingPluggyItem.created_at)
    )
    now = datetime.now(UTC)
    for pending in list(rows):
        conn = await _settle_one(db, pending, now, result)
        if conn is not None:
            result.connected.append(conn)
    await db.flush()
    return result


async def _settle_one(
    db: AsyncSession, pending: PendingPluggyItem, now: datetime, result: Settled
) -> BankConnection | None:
    state, accounts = await _look(pending.item_id)
    if state == "waiting" and now - pending.created_at < GIVE_UP_AFTER:
        result.waiting += 1
        return None
    await db.delete(pending)
    if not accounts:
        # Refused, never answered, or authorized without sharing any account.
        result.failed += 1
        await _quietly_delete(pending.item_id)
        return None
    return await _connect(db, pending, accounts)


async def _look(item_id: str) -> tuple[pluggy.LinkState, list[dict[str, Any]]]:
    try:
        state = pluggy.link_state(await pluggy.get_item(item_id))
        return state, await pluggy.list_accounts(item_id) if state == "ready" else []
    except AppError as exc:
        # Pluggy out of reach is not a refusal: look again next time.
        log.warning("pending pluggy item unreadable: %s", exc.detail)
        return "waiting", []


async def _connect(
    db: AsyncSession, pending: PendingPluggyItem, accounts: list[dict[str, Any]]
) -> BankConnection:
    bank = pluggy.bank_name({"connector": {"name": pluggy.MEU_PLUGGY}}, accounts)
    conn = await db.scalar(
        select(BankConnection).where(
            BankConnection.family_id == pending.family_id,
            BankConnection.provider == pluggy.PROVIDER,
            BankConnection.bank == bank,
        )
    )
    if conn is None:
        conn = BankConnection(
            family_id=pending.family_id,
            user_id=pending.user_id,
            provider=pluggy.PROVIDER,
            external_id=pending.item_id,
            bank=bank,
            accounts=[],
            sync_from=sync_service.first_read_day(date.today()),
        )
        db.add(conn)
    else:
        # Authorized again: read through the new item. The old one is left alone at
        # Pluggy, where something else may still read it.
        conn.external_id = pending.item_id
        conn.last_error = None
    await db.flush()
    return conn


async def _quietly_delete(item_id: str) -> None:
    try:
        await pluggy.delete_item(item_id)
    except AppError:
        log.info("could not delete an unfinished Pluggy item")
