"""Apagar as transações de um banco (Ajustes): every line of one bank's accounts goes,
of every month. The accounts, the other banks and the connections stay."""

import uuid
from collections.abc import Iterable

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.connections.models import BankConnection
from app.core.exceptions import ConflictError, NotFoundError
from app.imports.models import StatementImport
from app.transactions.models import ReviewStatus, Transaction
from app.transactions.schemas import BankPurge, BankPurgeAccount, PurgeResult
from app.transactions.services import transaction_service

# Reads of connected banks, which the Conexões page shows on its own.
_BANK_READS = ("eb", "pluggy")


async def banks(db: AsyncSession, family_id: uuid.UUID) -> list[BankPurge]:
    """Each bank that has lines, with what deleting it would take away."""
    rows = await db.execute(
        select(Account, Transaction.review, func.count())
        .join(Transaction, Transaction.account_id == Account.id)
        .where(Account.family_id == family_id)
        .group_by(Account.id, Transaction.review)
        .order_by(Account.bank, Account.name)
    )
    by_bank: dict[str, BankPurge] = {}
    seen: dict[uuid.UUID, BankPurgeAccount] = {}
    for account, review, count in rows:
        bank = by_bank.setdefault(
            account.bank,
            BankPurge(
                bank=account.bank,
                transactions=0,
                to_review=0,
                imports=0,
                connected=False,
                accounts=[],
            ),
        )
        if account.id not in seen:
            seen[account.id] = BankPurgeAccount(
                id=account.id,
                name=account.name,
                currency=account.currency,
                is_card=account.is_card,
                transactions=0,
            )
            bank.accounts.append(seen[account.id])
        seen[account.id].transactions += count
        bank.transactions += count
        if review == ReviewStatus.PENDING:
            bank.to_review += count
    connected = await _connected_accounts(db, family_id)
    for bank in by_bank.values():
        ids = {a.id for a in bank.accounts}
        bank.imports = await _statements(db, await _imports_only_of(db, ids))
        bank.connected = bool(ids & connected)
    return list(by_bank.values())


async def delete_bank(
    db: AsyncSession, family_id: uuid.UUID, bank: str, expected: int
) -> PurgeResult:
    """Deletes every line of the bank's accounts. `expected` is the number the person saw:
    if lines came in meanwhile (a bank sync), nothing is deleted."""
    now = next((b for b in await banks(db, family_id) if b.bank == bank), None)
    if now is None:
        raise NotFoundError("Não há transações deste banco.")
    if now.transactions != expected:
        raise ConflictError(
            f"Agora são {now.transactions} transações, não {expected}. Confira e tente de novo."
        )
    ids = {a.id for a in now.accounts}
    imports = await _imports_only_of(db, ids)
    lines = list(await db.scalars(select(Transaction).where(Transaction.account_id.in_(ids))))
    # Transfers to the other banks lose their other side: those wait for the person again.
    await transaction_service.delete_lines(db, lines)
    if imports:
        await db.execute(delete(StatementImport).where(StatementImport.id.in_(imports)))
    # The bank's connected accounts read their history again on the next sync.
    for conn in await db.scalars(
        select(BankConnection).where(BankConnection.family_id == family_id)
    ):
        conn.accounts = [_unsynced(a, ids) for a in conn.accounts]
    await db.flush()
    return PurgeResult(removed=len(lines))


def _unsynced(stored: dict[str, object], ids: set[uuid.UUID]) -> dict[str, object]:
    if stored.get("account_id") in {str(i) for i in ids}:
        return {**stored, "synced": False}
    return stored


async def _imports_only_of(db: AsyncSession, ids: Iterable[uuid.UUID]) -> set[uuid.UUID]:
    """Sent statements whose every line is in these accounts."""
    ids = list(ids)
    here = set(
        await db.scalars(
            select(Transaction.import_id)
            .where(Transaction.account_id.in_(ids), Transaction.import_id.is_not(None))
            .distinct()
        )
    )
    if not here:
        return set()
    elsewhere = set(
        await db.scalars(
            select(Transaction.import_id)
            .where(Transaction.import_id.in_(here), Transaction.account_id.not_in(ids))
            .distinct()
        )
    )
    return {i for i in here - elsewhere if i is not None}


async def _statements(db: AsyncSession, imports: set[uuid.UUID]) -> int:
    """Of these, the statements the person sent (bank reads show on Conexões instead)."""
    if not imports:
        return 0
    count = await db.scalar(
        select(func.count())
        .select_from(StatementImport)
        .where(StatementImport.id.in_(imports), StatementImport.format.not_in(_BANK_READS))
    )
    return count or 0


async def _connected_accounts(db: AsyncSession, family_id: uuid.UUID) -> set[uuid.UUID]:
    found: set[uuid.UUID] = set()
    for conn in await db.scalars(
        select(BankConnection).where(BankConnection.family_id == family_id)
    ):
        found |= {uuid.UUID(a["account_id"]) for a in conn.accounts if a.get("account_id")}
    return found
