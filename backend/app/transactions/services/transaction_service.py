import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.categories.models import Category, CategoryKind, CategoryRule
from app.categories.services.categorize import merchant_key
from app.core.exceptions import NotFoundError
from app.transactions.models import Transaction
from app.transactions.schemas import TransactionOut, TransactionPage, TransactionUpdate


async def list_transactions(
    db: AsyncSession,
    family_id: uuid.UUID,
    *,
    account_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> TransactionPage:
    where = [Transaction.family_id == family_id]
    if account_id is not None:
        where.append(Transaction.account_id == account_id)
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
        items=[_out(tx, account_name, category_name) for tx, account_name, category_name in rows],
    )


async def update_transaction(
    db: AsyncSession, family_id: uuid.UUID, tx_id: uuid.UUID, data: TransactionUpdate
) -> TransactionOut:
    tx = await db.get(Transaction, tx_id)
    if tx is None or tx.family_id != family_id:
        raise NotFoundError("Transação não encontrada")
    category = await db.get(Category, data.category_id)
    if category is None or category.family_id != family_id:
        raise NotFoundError("Categoria não encontrada")
    tx.category_id = category.id
    tx.is_transfer = category.kind == CategoryKind.TRANSFER
    if data.apply_to_merchant and (key := merchant_key(tx.description)):
        await db.execute(
            insert(CategoryRule)
            .values(id=uuid.uuid4(), family_id=family_id, merchant_key=key, category_id=category.id)
            .on_conflict_do_update(
                constraint="uq_rule_family_merchant", set_={"category_id": category.id}
            )
        )
    await db.flush()
    account = await db.get(Account, tx.account_id)
    assert account is not None
    return _out(tx, account.name, category.name)


def _out(tx: Transaction, account_name: str, category_name: str | None) -> TransactionOut:
    return TransactionOut(
        id=tx.id,
        date=tx.date,
        description=tx.description,
        amount=tx.amount,
        currency=tx.currency,
        is_transfer=tx.is_transfer,
        account_id=tx.account_id,
        account_name=account_name,
        category_id=tx.category_id,
        category_name=category_name,
        member_id=tx.member_id,
    )
