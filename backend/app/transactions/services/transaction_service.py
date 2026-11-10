import uuid
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.categories.models import Category, CategoryKind, CategoryRule
from app.categories.services import category_service
from app.categories.services.categorize import TRANSFER, merchant_key
from app.core.exceptions import NotFoundError
from app.imports.services.transfers import MAX_DAYS
from app.transactions.models import Transaction, TxKind
from app.transactions.schemas import (
    KindUpdate,
    TransactionOut,
    TransactionPage,
    TransactionUpdate,
)
from app.transactions.services.months import month_range


async def list_transactions(
    db: AsyncSession,
    family_id: uuid.UUID,
    *,
    account_id: uuid.UUID | None = None,
    month: str | None = None,
    kinds: list[TxKind] | None = None,
    limit: int = 50,
    offset: int = 0,
) -> TransactionPage:
    where = [Transaction.family_id == family_id]
    if account_id is not None:
        where.append(Transaction.account_id == account_id)
    if month is not None:
        lo, hi = month_range(month)
        where.append(Transaction.date.between(lo, hi))
    if kinds:
        where.append(Transaction.kind.in_(kinds))
    total = await db.scalar(select(func.count()).select_from(Transaction).where(*where))
    rows = await db.execute(
        select(Transaction, Account.name, Category.name)
        .join(Account, Account.id == Transaction.account_id)
        .outerjoin(Category, Category.id == Transaction.category_id)
        .where(*where)
        .order_by(Transaction.date.desc(), Transaction.created_at.desc(), Transaction.id)
        .limit(limit)
        .offset(offset)
    )
    return TransactionPage(
        total=total or 0,
        items=[to_out(tx, account_name, category_name) for tx, account_name, category_name in rows],
    )


async def _get(db: AsyncSession, family_id: uuid.UUID, tx_id: uuid.UUID) -> Transaction:
    tx = await db.get(Transaction, tx_id)
    if tx is None or tx.family_id != family_id:
        raise NotFoundError("Transação não encontrada")
    return tx


async def update_transaction(
    db: AsyncSession, family_id: uuid.UUID, tx_id: uuid.UUID, data: TransactionUpdate
) -> TransactionOut:
    tx = await _get(db, family_id, tx_id)
    category = await db.get(Category, data.category_id)
    if category is None or category.family_id != family_id:
        raise NotFoundError("Categoria não encontrada")
    kind = TxKind.TRANSFER if category.kind == CategoryKind.TRANSFER else TxKind.REGULAR
    if kind != TxKind.TRANSFER:
        await _unpair(db, tx)
    tx.kind = kind
    tx.category_id = category.id
    if data.apply_to_merchant and (key := merchant_key(tx.description)):
        await db.execute(
            insert(CategoryRule)
            .values(id=uuid.uuid4(), family_id=family_id, merchant_key=key, category_id=category.id)
            .on_conflict_do_update(
                constraint="uq_rule_family_merchant", set_={"category_id": category.id}
            )
        )
    await db.flush()
    return await _out_of(db, tx)


async def set_kind(
    db: AsyncSession, family_id: uuid.UUID, tx_id: uuid.UUID, data: KindUpdate
) -> TransactionOut:
    """The person says what a line was: spending/income, investment or own transfer."""
    tx = await _get(db, family_id, tx_id)
    kind = TxKind(data.kind)
    categories = await category_service.categories_by_name(db, family_id)
    transfer_category = categories.get(TRANSFER)
    if kind != TxKind.TRANSFER:
        await _unpair(db, tx)
    tx.kind = kind
    if kind == TxKind.TRANSFER:
        tx.category_id = transfer_category.id if transfer_category else None
        if tx.transfer_pair_id is None and (other := await _mirror(db, tx)) is not None:
            tx.transfer_pair_id = other.id
            other.transfer_pair_id = tx.id
            other.kind = TxKind.TRANSFER
            other.category_id = tx.category_id
    elif kind == TxKind.INVESTMENT:
        tx.category_id = None
    else:
        categorizer = await category_service.categorizer_for(db, family_id)
        name = categorizer.category_for(tx.description, tx.amount)
        category = categories.get(name)
        tx.category_id = category.id if category else None
    await db.flush()
    return await _out_of(db, tx)


async def _unpair(db: AsyncSession, tx: Transaction) -> None:
    """Breaking a pair leaves the other side waiting for the person to say what it was."""
    if tx.transfer_pair_id is None:
        return
    other = await db.get(Transaction, tx.transfer_pair_id)
    tx.transfer_pair_id = None
    if other is not None and other.transfer_pair_id == tx.id:
        other.transfer_pair_id = None
        other.kind = TxKind.PENDING
        other.category_id = None


async def _mirror(db: AsyncSession, tx: Transaction) -> Transaction | None:
    """The other side of a transfer, in another account: same value, opposite sign."""
    rows = list(
        await db.scalars(
            select(Transaction).where(
                Transaction.family_id == tx.family_id,
                Transaction.account_id != tx.account_id,
                Transaction.currency == tx.currency,
                Transaction.amount == -tx.amount,
                # Never a line the person already called spending or income.
                Transaction.kind.in_([TxKind.PENDING, TxKind.TRANSFER]),
                Transaction.transfer_pair_id.is_(None),
                Transaction.date.between(
                    tx.date - timedelta(days=MAX_DAYS), tx.date + timedelta(days=MAX_DAYS)
                ),
            )
        )
    )
    # Prefer a side that is itself waiting to be confirmed, then the closest date.
    rows.sort(key=lambda t: (t.kind != TxKind.PENDING, abs((t.date - tx.date).days)))
    return rows[0] if rows else None


async def _out_of(db: AsyncSession, tx: Transaction) -> TransactionOut:
    account = await db.get(Account, tx.account_id)
    assert account is not None
    category = await db.get(Category, tx.category_id) if tx.category_id else None
    return to_out(tx, account.name, category.name if category else None)


def to_out(tx: Transaction, account_name: str, category_name: str | None) -> TransactionOut:
    return TransactionOut(
        id=tx.id,
        date=tx.date,
        description=tx.description,
        amount=tx.amount,
        currency=tx.currency,
        kind=tx.kind,
        account_id=tx.account_id,
        account_name=account_name,
        category_id=tx.category_id,
        category_name=category_name,
        member_id=tx.member_id,
    )
