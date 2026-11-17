"""Apagar todas as transações (Ajustes): every line of the family goes, of every month."""

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.models import BankConnection
from app.core.exceptions import ConflictError
from app.imports.models import ImportStatus, StatementImport
from app.transactions.models import ReviewStatus, Transaction
from app.transactions.schemas import PurgeOverview, PurgeResult

# Reads of connected banks, which the Conexões page shows on its own.
_BANK_READS = ("eb", "pluggy")


async def overview(db: AsyncSession, family_id: uuid.UUID) -> PurgeOverview:
    """What "Apagar todas as transações" would take away, for the confirmation."""
    rows = await db.execute(
        select(Transaction.review, func.count())
        .where(Transaction.family_id == family_id)
        .group_by(Transaction.review)
    )
    by_review = {review: count for review, count in rows}
    imports = await db.scalar(
        select(func.count())
        .select_from(StatementImport)
        .where(
            StatementImport.family_id == family_id,
            StatementImport.status == ImportStatus.IMPORTED,
            StatementImport.format.not_in(_BANK_READS),
        )
    )
    banks = await db.scalar(
        select(func.count())
        .select_from(BankConnection)
        .where(BankConnection.family_id == family_id)
    )
    return PurgeOverview(
        transactions=sum(by_review.values()),
        to_review=by_review.get(ReviewStatus.PENDING, 0),
        imports=imports or 0,
        banks=banks or 0,
    )


async def delete_all(db: AsyncSession, family_id: uuid.UUID, expected: int) -> PurgeResult:
    """Deletes every line and the statement history. Accounts, categories, rules, people
    and bank connections stay. `expected` is the number the person saw: if lines came in
    meanwhile (a bank sync), nothing is deleted."""
    now = await overview(db, family_id)
    if now.transactions != expected:
        raise ConflictError(
            f"Agora são {now.transactions} transações, não {expected}. Confira e tente de novo."
        )
    await db.execute(delete(Transaction).where(Transaction.family_id == family_id))
    await db.execute(delete(StatementImport).where(StatementImport.family_id == family_id))
    # Connected banks read their history again on the next sync, for review.
    for conn in await db.scalars(
        select(BankConnection).where(BankConnection.family_id == family_id)
    ):
        conn.accounts = [{**a, "synced": False} for a in conn.accounts]
    await db.flush()
    return PurgeResult(removed=now.transactions)
