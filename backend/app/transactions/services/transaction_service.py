import uuid
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.categories.models import Category, CategoryKind, CategoryRule
from app.categories.services import category_service
from app.categories.services.categorize import INVESTMENT, TRANSFER, merchant_key
from app.core.exceptions import NotFoundError
from app.core.family_scope import get_in_family
from app.families.models import Currency
from app.families.services.family_service import month_start_day
from app.fx.services.fx_service import Converter, converter
from app.imports.models import StatementImport
from app.imports.services.transfers import MAX_DAYS
from app.transactions.models import ReviewStatus, Transaction, TxKind
from app.transactions.schemas import (
    KindUpdate,
    ReviewDecision,
    ReviewGroup,
    ReviewQueue,
    ReviewResult,
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
    category_id: uuid.UUID | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
    currency: Currency | None = None,
    review: ReviewStatus = ReviewStatus.APPROVED,
) -> TransactionPage:
    where = [Transaction.family_id == family_id, Transaction.review == review]
    if account_id is not None:
        where.append(Transaction.account_id == account_id)
    if month is not None:
        lo, hi = month_range(month, await month_start_day(db, family_id))
        where.append(Transaction.date.between(lo, hi))
    if kinds:
        where.append(Transaction.kind.in_(kinds))
    if category_id is not None:
        where.append(Transaction.category_id == category_id)
    if q and (text := q.strip()):
        # The person's words are matched literally, so % and _ mean themselves.
        pattern = "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where.append(Transaction.description.ilike(pattern, escape="\\"))
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
    found = list(rows)
    dates = [tx.date for tx, _, _ in found]
    conv = await converter(db, currency, min(dates, default=None), max(dates, default=None))
    return TransactionPage(
        total=total or 0,
        items=[
            to_out(tx, account_name, category_name, conv)
            for tx, account_name, category_name in found
        ],
    )


async def _get(db: AsyncSession, family_id: uuid.UUID, tx_id: uuid.UUID) -> Transaction:
    return await get_in_family(db, Transaction, family_id, tx_id, "Transação não encontrada")


async def update_transaction(
    db: AsyncSession, family_id: uuid.UUID, tx_id: uuid.UUID, data: TransactionUpdate
) -> TransactionOut:
    """The person corrects a line: description, date, amount and/or category."""
    tx = await _get(db, family_id, tx_id)
    if data.description is not None:
        tx.description = data.description
    if data.date is not None:
        tx.date = data.date
    if data.amount is not None:
        await _change_amount(db, tx, data.amount)
    if data.category_id is not None:
        await _change_category(db, family_id, tx, data.category_id, data.apply_to_merchant)
    await db.flush()
    return await _out_of(db, tx)


async def _change_amount(db: AsyncSession, tx: Transaction, amount: Decimal) -> None:
    if tx.transfer_pair_id is not None:
        other = await db.get(Transaction, tx.transfer_pair_id)
        # Once the two sides no longer mirror each other they are not one transfer.
        if other is None or other.amount != -amount:
            await _unpair(db, tx)
    if (tx.amount < 0) != (amount < 0) and tx.category_id is not None:
        # Spending turned into income (or back): its category no longer fits.
        category = await db.get(Category, tx.category_id)
        # Investimento fits both ways: putting money in and taking it out.
        if category is not None and not _moves_money(category):
            tx.category_id = None
    tx.amount = amount.quantize(Decimal("0.0001"))


async def _change_category(
    db: AsyncSession,
    family_id: uuid.UUID,
    tx: Transaction,
    category_id: uuid.UUID,
    apply_to_merchant: bool,
) -> None:
    category = await db.get(Category, category_id)
    if category is None or category.family_id != family_id:
        raise NotFoundError("Categoria não encontrada")
    kind = TxKind.REGULAR
    if category.kind == CategoryKind.TRANSFER:
        kind = TxKind.TRANSFER
    elif category.system_key == INVESTMENT:
        kind = TxKind.INVESTMENT
    if kind != TxKind.TRANSFER:
        await _unpair(db, tx)
    tx.kind = kind
    tx.category_id = category.id
    if apply_to_merchant and (key := merchant_key(tx.description)):
        await db.execute(
            insert(CategoryRule)
            .values(id=uuid.uuid4(), family_id=family_id, merchant_key=key, category_id=category.id)
            .on_conflict_do_update(
                constraint="uq_rule_family_merchant", set_={"category_id": category.id}
            )
        )


def _moves_money(category: Category) -> bool:
    return category.kind == CategoryKind.TRANSFER or category.system_key == INVESTMENT


async def delete_transaction(db: AsyncSession, family_id: uuid.UUID, tx_id: uuid.UUID) -> None:
    """Removes a line for good; the other side of a transfer goes back to waiting."""
    tx = await _get(db, family_id, tx_id)
    await _unpair(db, tx)
    await db.delete(tx)
    await db.flush()


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
        investment_category = categories.get(INVESTMENT)
        tx.category_id = investment_category.id if investment_category else None
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
                Transaction.review != ReviewStatus.REJECTED,
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


def to_out(
    tx: Transaction, account_name: str, category_name: str | None, conv: Converter | None = None
) -> TransactionOut:
    converted = conv is not None and conv.target is not None
    return TransactionOut(
        display_amount=conv(tx.amount, tx.currency, tx.date) if conv and converted else None,
        display_currency=conv.target if conv else None,
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
        review=tx.review,
    )


# ── review of imported lines ─────────────────────────────────────────────────

BANK_FORMATS = ("eb", "pluggy")


async def review_queue(
    db: AsyncSession, family_id: uuid.UUID, currency: Currency | None = None
) -> ReviewQueue:
    """Imported lines waiting for approval, grouped by the upload or bank read they came in."""
    rows = list(
        await db.execute(
            select(Transaction, Account.name, Category.name, StatementImport)
            .join(Account, Account.id == Transaction.account_id)
            .outerjoin(Category, Category.id == Transaction.category_id)
            .outerjoin(StatementImport, StatementImport.id == Transaction.import_id)
            .where(Transaction.family_id == family_id, Transaction.review == ReviewStatus.PENDING)
            .order_by(Transaction.date.desc(), Transaction.created_at.desc(), Transaction.id)
        )
    )
    dates = [tx.date for tx, *_ in rows]
    conv = await converter(db, currency, min(dates, default=None), max(dates, default=None))
    groups: dict[uuid.UUID | None, ReviewGroup] = {}
    for tx, account_name, category_name, imp in rows:
        group = groups.get(tx.import_id)
        if group is None:
            group = groups[tx.import_id] = _group(imp, account_name)
        group.items.append(to_out(tx, account_name, category_name, conv))
    ordered = sorted(groups.values(), key=lambda g: (g.imported_at is None, g.imported_at))
    ordered.reverse()
    return ReviewQueue(total=len(rows), groups=ordered)


def _group(imp: StatementImport | None, account_name: str) -> ReviewGroup:
    if imp is None:
        return ReviewGroup(import_id=None, label=account_name, source="statement", items=[])
    return ReviewGroup(
        import_id=imp.id,
        label=imp.filename,
        source="bank" if imp.format in BANK_FORMATS else "statement",
        imported_at=imp.created_at,
        items=[],
    )


async def decide(db: AsyncSession, family_id: uuid.UUID, data: ReviewDecision) -> ReviewResult:
    """Approves imported lines (they start counting) or turns them down (hidden for good)."""
    rows = list(
        await db.scalars(
            select(Transaction).where(
                Transaction.family_id == family_id,
                Transaction.id.in_(data.ids),
                Transaction.review == ReviewStatus.PENDING,
            )
        )
    )
    for tx in rows:
        if data.decision == "approve":
            tx.review = ReviewStatus.APPROVED
        else:
            # A turned-down line can't keep completing a transfer on another account.
            await _unpair(db, tx)
            tx.review = ReviewStatus.REJECTED
    await db.flush()
    left = await db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(Transaction.family_id == family_id, Transaction.review == ReviewStatus.PENDING)
    )
    return ReviewResult(count=len(rows), left=left or 0)
