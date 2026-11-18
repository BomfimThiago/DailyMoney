import uuid
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.categories.models import Category, CategoryKind, CategoryRule
from app.categories.services import category_service
from app.categories.services.categorize import INVESTMENT, TRANSFER, merchant_key
from app.core.exceptions import NotFoundError
from app.core.family_scope import get_in_family
from app.families.models import Currency, Member
from app.families.services.family_service import month_start_day
from app.fx.services.fx_service import Converter, converter
from app.imports.models import StatementImport
from app.imports.services.transfers import MAX_DAYS
from app.transactions.models import ReviewStatus, Transaction, TxKind
from app.transactions.schemas import (
    CurrencyTotals,
    GroupTotal,
    KindUpdate,
    ReviewDecision,
    ReviewGroup,
    ReviewQueue,
    ReviewResult,
    TransactionOut,
    TransactionPage,
    TransactionTotals,
    TransactionUpdate,
)
from app.transactions.services.months import month_range

# The household ("Casa") has no member id; a filter for its lines uses this word instead.
HOUSEHOLD = "casa"
HOUSEHOLD_NAME = "Casa"
NO_CATEGORY = "Sem categoria"


async def _where(
    db: AsyncSession,
    family_id: uuid.UUID,
    *,
    account_id: uuid.UUID | None,
    month: str | None,
    kinds: list[TxKind] | None,
    category_id: uuid.UUID | None,
    member: uuid.UUID | str | None,
    q: str | None,
    review: ReviewStatus,
) -> list[ColumnElement[bool]]:
    """The filters of the transactions list, shared by the page and its totals."""
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
    if member == HOUSEHOLD:
        where.append(Transaction.member_id.is_(None))
    elif member is not None:
        where.append(Transaction.member_id == member)
    if q and (text := q.strip()):
        # The person's words are matched literally, so % and _ mean themselves.
        pattern = "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where.append(Transaction.description.ilike(pattern, escape="\\"))
    return where


async def list_transactions(
    db: AsyncSession,
    family_id: uuid.UUID,
    *,
    account_id: uuid.UUID | None = None,
    month: str | None = None,
    kinds: list[TxKind] | None = None,
    category_id: uuid.UUID | None = None,
    member: uuid.UUID | str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
    currency: Currency | None = None,
    review: ReviewStatus = ReviewStatus.APPROVED,
) -> TransactionPage:
    where = await _where(
        db,
        family_id,
        account_id=account_id,
        month=month,
        kinds=kinds,
        category_id=category_id,
        member=member,
        q=q,
        review=review,
    )
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


class _Sum:
    def __init__(self, id: uuid.UUID | None = None, name: str = "") -> None:
        self.id, self.name = id, name
        self.income = self.spending = Decimal("0")
        self.count = 0

    def add(self, amount: Decimal) -> None:
        if amount > 0:
            self.income += amount
        else:
            self.spending -= amount
        self.count += 1

    def group(self) -> GroupTotal:
        return GroupTotal(
            id=self.id,
            name=self.name,
            income=self.income,
            spending=self.spending,
            count=self.count,
        )


def _biggest_first(groups: dict[object, _Sum]) -> list[GroupTotal]:
    ordered = sorted(groups.values(), key=lambda g: (-g.spending, -g.income, g.name))
    return [g.group() for g in ordered]


class _CurrencySum:
    def __init__(self) -> None:
        self.all = _Sum()
        self.by: dict[str, dict[object, _Sum]] = {
            "categories": {},
            "members": {},
            "accounts": {},
        }

    def add(self, amount: Decimal, keys: dict[str, tuple[uuid.UUID | None, str]]) -> None:
        self.all.add(amount)
        for dimension, (key, name) in keys.items():
            self.by[dimension].setdefault(key, _Sum(key, name)).add(amount)

    def totals(self, currency: Currency) -> CurrencyTotals:
        return CurrencyTotals(
            currency=currency,
            income=self.all.income,
            spending=self.all.spending,
            balance=self.all.income - self.all.spending,
            count=self.all.count,
            categories=_biggest_first(self.by["categories"]),
            members=_biggest_first(self.by["members"]),
            accounts=_biggest_first(self.by["accounts"]),
        )


async def totals(
    db: AsyncSession,
    family_id: uuid.UUID,
    *,
    account_id: uuid.UUID | None = None,
    month: str | None = None,
    kinds: list[TxKind] | None = None,
    category_id: uuid.UUID | None = None,
    member: uuid.UUID | str | None = None,
    q: str | None = None,
    currency: Currency | None = None,
) -> TransactionTotals:
    """Entradas and saídas of every line the list would show, and the same by group."""
    where = await _where(
        db,
        family_id,
        account_id=account_id,
        month=month,
        kinds=kinds,
        category_id=category_id,
        member=member,
        q=q,
        review=ReviewStatus.APPROVED,
    )
    rows = list(
        await db.execute(
            select(
                Transaction.amount,
                Transaction.currency,
                Transaction.date,
                Transaction.category_id,
                Category.name,
                Transaction.member_id,
                Member.name,
                Transaction.account_id,
                Account.name,
            )
            .join(Account, Account.id == Transaction.account_id)
            .outerjoin(Category, Category.id == Transaction.category_id)
            .outerjoin(Member, Member.id == Transaction.member_id)
            .where(*where)
        )
    )
    dates = [row.date for row in rows]
    conv = await converter(db, currency, min(dates, default=None), max(dates, default=None))
    sums: dict[Currency, _CurrencySum] = {}
    for amount, original, day, cat_id, cat, member_id, person, acc_id, acc in rows:
        shown = conv.currency(original)
        keys = {
            "categories": (cat_id, cat or NO_CATEGORY),
            "members": (member_id, person or HOUSEHOLD_NAME),
            "accounts": (acc_id, acc),
        }
        sums.setdefault(shown, _CurrencySum()).add(conv(amount, original, day), keys)
    return TransactionTotals(
        count=len(rows),
        currencies=[s.totals(c) for c, s in sorted(sums.items(), key=lambda kv: kv[0].value)],
    )


async def _get(db: AsyncSession, family_id: uuid.UUID, tx_id: uuid.UUID) -> Transaction:
    return await get_in_family(db, Transaction, family_id, tx_id, "Transação não encontrada")


async def update_transaction(
    db: AsyncSession, family_id: uuid.UUID, tx_id: uuid.UUID, data: TransactionUpdate
) -> TransactionOut:
    """The person corrects a line: description, date, amount, category and/or owner."""
    tx = await _get(db, family_id, tx_id)
    # Null is a real choice (the household), so "sent" is told apart from "left out".
    if "member_id" in data.model_fields_set:
        if data.member_id is not None:
            await get_in_family(db, Member, family_id, data.member_id, "Membro não encontrado")
        tx.member_id = data.member_id
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
    if tx.review == ReviewStatus.PENDING:
        # Saying what a waiting line was is reviewing it; otherwise the answer stays out of
        # every list and figure until a separate approval.
        tx.review = ReviewStatus.APPROVED
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
