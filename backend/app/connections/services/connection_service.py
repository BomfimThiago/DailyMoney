"""Connecting banks: authorizing them, listing them, disconnecting, and the daily sync."""

import logging
import uuid
from datetime import UTC, date, datetime, timedelta

import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.connections.models import BankConnection
from app.connections.schemas import (
    AccountSyncOut,
    ConnectedAccount,
    ConnectionOut,
    ConnectionsOverview,
    SyncOut,
)
from app.connections.services import enablebanking, pluggy, sync_service
from app.connections.services.timestamps import instant
from app.core.config import settings
from app.core.exceptions import AppError, ConflictError
from app.core.family_scope import get_in_family
from app.families.models import User

log = logging.getLogger(__name__)

# Banks the family uses in Europe, read through Enable Banking.
EUROPEAN_BANKS = ("Wise", "Revolut", "CaixaBank")
DEFAULT_COUNTRY = "ES"
STATE_AUDIENCE = "enablebanking-auth"
CALLBACK_PATH = "/conexoes/retorno"


class BankNotFoundError(AppError):
    status_code = 422
    code = "BANK_NOT_FOUND"


def redirect_url() -> str:
    if settings.ENABLE_BANKING_REDIRECT_URL:
        return settings.ENABLE_BANKING_REDIRECT_URL
    return settings.APP_URL.rstrip("/") + CALLBACK_PATH


def canonical_bank(name: str) -> str:
    for known in EUROPEAN_BANKS:
        if known.lower() in name.lower():
            return known
    return name


async def list_connections(db: AsyncSession, user: User) -> list[BankConnection]:
    await _ensure_pluggy_items(db, user)
    rows = await db.scalars(
        select(BankConnection)
        .where(BankConnection.family_id == user.family_id)
        .order_by(BankConnection.created_at)
    )
    return list(rows)


async def _ensure_pluggy_items(db: AsyncSession, user: User) -> None:
    """Items connected in Meu Pluggy show up here once their ids are on the server."""
    if not pluggy.enabled() or not settings.PLUGGY_ITEM_IDS:
        return
    known = set(
        await db.scalars(
            select(BankConnection.external_id).where(
                BankConnection.family_id == user.family_id,
                BankConnection.provider == pluggy.PROVIDER,
            )
        )
    )
    for item_id in settings.PLUGGY_ITEM_IDS:
        if item_id in known:
            continue
        try:
            item = await pluggy.get_item(item_id)
        except AppError as exc:
            log.warning("pluggy item unreadable: %s", exc.detail)
            continue
        db.add(
            BankConnection(
                family_id=user.family_id,
                user_id=user.id,
                provider=pluggy.PROVIDER,
                external_id=item_id,
                bank=pluggy.bank_name(item),
                accounts=[],
                sync_from=sync_service.first_read_day(date.today()),
            )
        )
    await db.flush()


async def get_connection(
    db: AsyncSession, family_id: uuid.UUID, connection_id: uuid.UUID
) -> BankConnection:
    return await get_in_family(
        db, BankConnection, family_id, connection_id, "Conexão não encontrada"
    )


async def start_authorization(user: User, bank: str, country: str = DEFAULT_COUNTRY) -> str:
    banks = await enablebanking.list_banks(country)
    aspsp = next((a for a in banks if canonical_bank(str(a["name"])) == bank), None)
    if aspsp is None:
        raise BankNotFoundError(
            f"{bank} não aparece entre os bancos da Enable Banking em {country}."
        )
    seconds = min(
        int(aspsp.get("maximum_consent_validity") or enablebanking.MAX_CONSENT_SECONDS),
        enablebanking.MAX_CONSENT_SECONDS,
    )
    now = datetime.now(UTC)
    valid_until = now + timedelta(seconds=seconds - 300)
    state = jwt.encode(
        {
            "sub": str(user.id),
            "aud": STATE_AUDIENCE,
            "aspsp": aspsp["name"],
            "country": country,
            "exp": now + timedelta(hours=1),
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    return await enablebanking.start_authorization(
        str(aspsp["name"]), country, valid_until.isoformat(), state, redirect_url()
    )


def _read_state(state: str, user: User) -> dict[str, str]:
    try:
        claims = jwt.decode(
            state, settings.SECRET_KEY, algorithms=["HS256"], audience=STATE_AUDIENCE
        )
    except jwt.PyJWTError as exc:
        raise ConflictError(
            "Este retorno do banco venceu ou não é deste app. Conecte de novo."
        ) from exc
    if claims.get("sub") != str(user.id):
        raise ConflictError("Esta conexão foi começada por outra pessoa. Conecte de novo.")
    return claims


async def finish_authorization(
    db: AsyncSession, user: User, code: str, state: str
) -> BankConnection:
    claims = _read_state(state, user)
    session = await enablebanking.create_session(code)
    if not session.get("accounts"):
        await _quietly_close(str(session.get("session_id")))
        raise ConflictError(
            "O banco não autorizou nenhuma conta. Conecte de novo e marque as contas."
        )
    aspsp = session.get("aspsp") or {}
    name = str(aspsp.get("name") or claims["aspsp"])
    bank = canonical_bank(name)
    until = instant((session.get("access") or {}).get("valid_until"))

    conn = await db.scalar(
        select(BankConnection).where(
            BankConnection.family_id == user.family_id,
            BankConnection.provider == enablebanking.PROVIDER,
            BankConnection.bank == bank,
        )
    )
    if conn is None:
        conn = BankConnection(
            family_id=user.family_id,
            user_id=user.id,
            provider=enablebanking.PROVIDER,
            external_id=str(session["session_id"]),
            bank=bank,
            accounts=[],
            sync_from=sync_service.first_read_day(date.today()),
        )
        db.add(conn)
    else:
        old_session = conn.external_id
        conn.external_id = str(session["session_id"])
        if old_session != conn.external_id:
            await _quietly_close(old_session)
    conn.aspsp_name = name
    conn.country = str(aspsp.get("country") or claims["country"])
    conn.consent_expires_at = until
    conn.last_error = None
    conn.accounts = [
        dict(a) for a in sync_service.accounts_from_session(session, sync_service.stored(conn))
    ]
    await db.flush()
    return conn


async def _quietly_close(session_id: str) -> None:
    try:
        await enablebanking.delete_session(session_id)
    except AppError:
        log.info("could not close an old Enable Banking session")


async def disconnect(db: AsyncSession, conn: BankConnection) -> None:
    """Stops reading the bank. Transactions already read stay."""
    if conn.provider == enablebanking.PROVIDER:
        await _quietly_close(conn.external_id)
    await db.delete(conn)
    await db.flush()


async def sync_all(db: AsyncSession) -> list[sync_service.SyncResult]:
    """The daily read: every connection; one failing doesn't stop the others."""
    results = []
    for conn in await db.scalars(select(BankConnection).order_by(BankConnection.created_at)):
        results.append(await sync_service.sync_connection(db, conn))
        await db.commit()
    return results


# ── what the screen shows ────────────────────────────────────────────────────


async def overview(db: AsyncSession, user: User) -> ConnectionsOverview:
    conns = await list_connections(db, user)
    return ConnectionsOverview(
        connections=[await connection_out(db, c) for c in conns],
        european_banks=list(EUROPEAN_BANKS) if enablebanking.enabled() else [],
        brazil_ready=pluggy.enabled(),
    )


async def connection_out(db: AsyncSession, conn: BankConnection) -> ConnectionOut:
    ids = [uuid.UUID(a["account_id"]) for a in conn.accounts if a.get("account_id")]
    names = (
        {a.id: a.name for a in await db.scalars(select(Account).where(Account.id.in_(ids)))}
        if ids
        else {}
    )
    accounts = []
    for a in sync_service.stored(conn):
        linked = names.get(uuid.UUID(a["account_id"])) if a["account_id"] else None
        currency = a["currency"]
        fallback = f"{a['label']} {currency}" if currency else a["label"]
        accounts.append(
            ConnectedAccount(
                account_id=uuid.UUID(a["account_id"]) if a["account_id"] else None,
                name=linked or fallback,
                currency=currency,
                is_card=a["is_card"],
            )
        )
    return ConnectionOut(
        id=conn.id,
        provider="pluggy" if conn.provider == pluggy.PROVIDER else "enablebanking",
        bank=conn.bank,
        accounts=accounts,
        consent_expires_at=conn.consent_expires_at,
        last_sync_at=conn.last_sync_at,
        last_error=conn.last_error,
    )


async def sync_out(db: AsyncSession, result: sync_service.SyncResult) -> SyncOut:
    return SyncOut(
        connection=await connection_out(db, result.connection),
        accounts=[
            AccountSyncOut(name=a.name, new=a.new, duplicate=a.duplicate, error=a.error)
            for a in result.accounts
        ],
    )
