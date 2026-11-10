"""Reading connected banks into the family's accounts.

Each account the bank shares becomes one of the family's accounts (an existing one from
the same bank and currency when there is one, so statements sent before and the bank's
own lines land together). Its lines go through the same import as a statement file:
same duplicate rules, same transfer pairing, same categories. Nothing waits for review.

Reading again is safe: every line carries the bank's own id, so a line already saved is
recognised, and a line already sent in a statement is caught by the duplicate rules.
"""

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any, TypedDict

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.accounts.services import account_service
from app.connections.models import BankConnection
from app.connections.services import enablebanking, pluggy
from app.core.exceptions import AppError, ConflictError
from app.families.models import Currency, Member, User
from app.imports.schemas import AccountChoice
from app.imports.services import import_service
from app.statements.parsing.reader import finish_rows
from app.statements.parsing.types import Format, ParsedRow, ParsedStatement, RowError
from app.transactions.models import Transaction

log = logging.getLogger(__name__)

# A new connection reads up to a year back (European banks give that only right after
# the authorization; afterwards 90 days at most).
FIRST_READ_DAYS = 365
# Later reads go back a month before the last one: banks book some lines late.
OVERLAP_DAYS = 30


class StoredAccount(TypedDict):
    # Provider's id for the account; for Enable Banking it is only valid in its session.
    uid: str
    # Same in every session: identifies the account across new authorizations.
    key: str
    label: str
    currency: str | None
    is_card: bool
    last4: str | None
    # The family's account its lines go to, once known.
    account_id: str | None
    # True once it was read at least once.
    synced: bool


@dataclass
class AccountResult:
    name: str
    new: int = 0
    duplicate: int = 0
    error: str | None = None


@dataclass
class SyncResult:
    connection: BankConnection
    accounts: list[AccountResult] = field(default_factory=list)


def stored(conn: BankConnection) -> list[StoredAccount]:
    return [StoredAccount(**a) for a in conn.accounts]  # type: ignore[typeddict-item]


async def sync_connection(db: AsyncSession, conn: BankConnection) -> SyncResult:
    result = SyncResult(connection=conn)
    try:
        await _check(conn)
        if conn.provider == pluggy.PROVIDER:
            await _refresh_pluggy_accounts(conn)
        user = await _owner(db, conn)
        accounts = stored(conn)
        for account in accounts:
            outcome = AccountResult(name=account["label"])
            result.accounts.append(outcome)
            try:
                async with db.begin_nested():
                    await _sync_account(db, conn, user, account, outcome)
            except AppError as exc:
                outcome.error = exc.detail
            except Exception as exc:  # one account failing must not stop the others
                log.exception("bank sync failed for an account")
                outcome.error = f"Falha ao ler esta conta ({type(exc).__name__})."
        conn.accounts = [dict(a) for a in accounts]
        failures = [f"{a.name}: {a.error}" for a in result.accounts if a.error]
        conn.last_error = " · ".join(failures)[:1000] or None
    except AppError as exc:
        conn.last_error = exc.detail[:1000]
    conn.last_sync_at = datetime.now(UTC)
    await db.flush()
    return result


async def _check(conn: BankConnection) -> None:
    if conn.provider == enablebanking.PROVIDER:
        session = await enablebanking.get_session(conn.external_id)
        until = instant((session.get("access") or {}).get("valid_until"))
        if until:
            conn.consent_expires_at = until
        if session.get("status") != "AUTHORIZED" or (until and until < datetime.now(UTC)):
            raise ConflictError("A autorização deste banco venceu. Conecte de novo.")
    else:
        item = await pluggy.get_item(conn.external_id)
        conn.consent_expires_at = pluggy.check_item(item, datetime.now(UTC))


async def _refresh_pluggy_accounts(conn: BankConnection) -> None:
    """Pluggy's accounts can change (a new card); keep the links of the known ones."""
    known = {a["key"]: a for a in stored(conn)}
    fresh = []
    for a in await pluggy.list_accounts(conn.external_id):
        key = str(a["id"])
        old = known.get(key)
        card = pluggy.is_card(a)
        fresh.append(
            StoredAccount(
                uid=key,
                key=key,
                label="Cartão de crédito" if card else "Conta corrente",
                currency=str(a.get("currencyCode") or "").upper() or None,
                is_card=card,
                last4=None,
                account_id=old["account_id"] if old else None,
                synced=old["synced"] if old else False,
            )
        )
    conn.accounts = [dict(a) for a in fresh]


async def _owner(db: AsyncSession, conn: BankConnection) -> User:
    user = await db.get(User, conn.user_id) if conn.user_id else None
    if user is None:
        user = await db.scalar(
            select(User).where(User.family_id == conn.family_id).order_by(User.created_at)
        )
    if user is None:
        raise ConflictError("A família não tem nenhum usuário.")
    return user


async def _sync_account(
    db: AsyncSession,
    conn: BankConnection,
    user: User,
    account: StoredAccount,
    outcome: AccountResult,
) -> None:
    currency = account["currency"]
    if currency not in ("BRL", "USD", "EUR"):
        raise ConflictError(
            f"Conta em {currency or 'moeda desconhecida'}: o app usa BRL, USD e EUR."
        )
    target = await _target_account(db, conn, user, account, Currency(currency))
    outcome.name = target.name
    since = await _read_from(db, conn, account, target)

    fmt: Format
    if conn.provider == enablebanking.PROVIDER:
        fmt = "eb"
        txs = await enablebanking.list_transactions(account["uid"], since)
        rows, errors = enablebanking.map_transactions(txs, currency, since)
    else:
        fmt = "pluggy"
        txs = await pluggy.list_transactions(account["uid"])
        rows, errors = pluggy.map_transactions(currency, account["is_card"], txs, since)
    rows, errors = _same_currency(rows, errors, currency)
    account["synced"] = True
    if not rows:
        if errors:
            outcome.error = f"{len(errors)} linha(s) ilegível(is): {errors[0].message}"
        return

    statement = ParsedStatement(
        format=fmt,
        bank=conn.bank,
        is_card=account["is_card"],
        rows=finish_rows(rows),
        errors=errors,
    )
    imp = await import_service.store_statement(
        db, conn.family_id, user.id, f"{conn.bank} · {target.name}", statement
    )
    await import_service.confirm(
        db,
        user,
        imp,
        [AccountChoice(currency=Currency(currency), account_id=target.id)],
        since=None,
    )
    outcome.new = imp.imported_count
    outcome.duplicate = imp.duplicate_count
    if errors:
        outcome.error = f"{len(errors)} linha(s) ilegível(is): {errors[0].message}"
    if imp.imported_count == 0:
        # Nothing new: no need to keep a record of this read.
        await db.delete(imp)


def _same_currency(
    rows: list[ParsedRow], errors: list[RowError], currency: str
) -> tuple[list[ParsedRow], list[RowError]]:
    kept = []
    for n, row in enumerate(rows, start=1):
        if row.currency == currency:
            kept.append(row)
        else:
            errors.append(
                RowError(
                    row=n, message=f"Valor em {row.currency} numa conta em {currency}", raw=row.raw
                )
            )
    return kept, errors


async def _target_account(
    db: AsyncSession, conn: BankConnection, user: User, account: StoredAccount, currency: Currency
) -> Account:
    if account["account_id"]:
        found = await db.get(Account, uuid.UUID(account["account_id"]))
        if found is not None and found.family_id == conn.family_id:
            return found
    match: Account | None = await db.scalar(
        select(Account)
        .where(
            Account.family_id == conn.family_id,
            Account.bank == conn.bank,
            Account.currency == currency,
            Account.is_card == account["is_card"],
        )
        .order_by(Account.created_at)
        .limit(1)
    )
    if match is None:
        member_id = await db.scalar(select(Member.id).where(Member.user_id == user.id))
        match = await account_service.create_account(
            db,
            conn.family_id,
            name=await _free_name(db, conn.family_id, _account_name(conn.bank, account, currency)),
            bank=conn.bank,
            currency=currency,
            is_card=account["is_card"],
            member_id=member_id,
        )
    account["account_id"] = str(match.id)
    return match


def _account_name(bank: str, account: StoredAccount, currency: Currency) -> str:
    return f"{bank} cartão" if account["is_card"] else f"{bank} {currency.value}"


async def _free_name(db: AsyncSession, family_id: uuid.UUID, name: str) -> str:
    taken = set(await db.scalars(select(Account.name).where(Account.family_id == family_id)))
    candidate, n = name, 2
    while candidate in taken:
        candidate, n = f"{name} {n}", n + 1
    return candidate


async def _read_from(
    db: AsyncSession, conn: BankConnection, account: StoredAccount, target: Account
) -> date:
    if account["synced"] and conn.last_sync_at:
        return max(conn.sync_from, conn.last_sync_at.date() - timedelta(days=OVERLAP_DAYS))
    # First read of an account that already has statements: start on the last day they
    # cover (that day's lines are caught as duplicates), not a year back.
    last: date | None = await db.scalar(
        select(func.max(Transaction.date)).where(Transaction.account_id == target.id)
    )
    return max(conn.sync_from, last) if last else conn.sync_from


def instant(text: object) -> datetime | None:
    if not text:
        return None
    try:
        return datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    except ValueError:
        return None


def first_read_day(today: date) -> date:
    return today - timedelta(days=FIRST_READ_DAYS)


def accounts_from_session(session: dict[str, Any], old: list[StoredAccount]) -> list[StoredAccount]:
    """Enable Banking session accounts, keeping the link of accounts seen before."""
    known = {a["key"]: a for a in old}
    out = []
    for a in session.get("accounts") or []:
        key = enablebanking.account_key(a)
        before = known.get(key)
        card = enablebanking.is_card(a)
        out.append(
            StoredAccount(
                uid=str(a["uid"]),
                key=key,
                label="Cartão" if card else "Conta",
                currency=str(a.get("currency") or "").upper() or None,
                is_card=card,
                last4=enablebanking.account_last4(a),
                account_id=before["account_id"] if before else None,
                # A new authorization reads from the last saved line again: it catches
                # up whatever happened while the old one was expired.
                synced=False,
            )
        )
    return out
