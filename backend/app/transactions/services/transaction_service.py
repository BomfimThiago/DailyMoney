import uuid
from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import ColumnElement, Select, and_, func, not_, or_, select, true
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.categories.models import Category, CategoryKind, CategoryRule
from app.categories.services import category_service
from app.categories.services.categorize import CARD_PAYMENT, INVESTMENT, TRANSFER, merchant_key
from app.core.exceptions import NotFoundError
from app.core.family_scope import get_in_family
from app.families.models import Currency, Member
from app.families.services.family_service import month_start_day
from app.fx.services.fx_service import Converter, converter
from app.imports.models import StatementImport
from app.imports.services.transfers import MAX_DAYS
from app.transactions.models import ReviewStatus, Transaction, TxKind
from app.transactions.schemas import (
    CurrencyAmount,
    CurrencyTotals,
    DayTotal,
    GroupTotal,
    KindUpdate,
    LatestMonth,
    LineCurrencies,
    ReviewDecision,
    ReviewGroup,
    ReviewQueue,
    ReviewResult,
    TransactionOut,
    TransactionPage,
    TransactionTotals,
    TransactionUpdate,
)
from app.transactions.services import card_payments
from app.transactions.services.flow import Flow
from app.transactions.services.months import month_of, month_range

Direction = Literal["in", "out"]
# How the list is ordered: by day (newest first), or by description or amount ("-" = reverse).
Sort = Literal["date", "description", "-description", "amount", "-amount"]
_ORDER = {
    "description": (func.lower(Transaction.description).asc(),),
    "-description": (func.lower(Transaction.description).desc(),),
    "amount": (Transaction.amount.asc(),),
    "-amount": (Transaction.amount.desc(),),
}


# A value of one dimension: an id, or a word for the lines that have none ("none" for no
# category, "casa" for the household) or, for banks, the bank's name.
Value = uuid.UUID | str


@dataclass(frozen=True)
class Pick:
    """One dimension of the filters: show only these values, and/or hide these."""

    only: tuple[Value, ...] = ()
    hide: tuple[Value, ...] = ()


@dataclass(frozen=True)
class Filters:
    """The filters of the list (Transações), shared by the page and its totals."""

    month: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    kinds: list[TxKind] | None = None
    categories: Pick = field(default_factory=Pick)
    members: Pick = field(default_factory=Pick)
    accounts: Pick = field(default_factory=Pick)
    banks: Pick = field(default_factory=Pick)
    q: str | None = None
    direction: Direction | None = None
    account_currency: Currency | None = None
    # A card's bill (YYYY-MM): the purchases charged in it, whatever day they were made.
    card_bill: str | None = None


# The household ("Casa") has no member id; a filter for its lines uses this word instead.
HOUSEHOLD = "casa"
HOUSEHOLD_NAME = "Casa"
# Lines with no category; a filter for them uses this word.
NO_CATEGORY_KEY = "none"
NO_CATEGORY = "Sem categoria"


def _matches(column: Any, values: tuple[Value, ...], empty: str | None) -> ColumnElement[bool]:
    ids = [v for v in values if v != empty]
    parts = [column.in_(ids)] if ids else []
    if empty is not None and empty in values:
        parts.append(column.is_(None))
    return or_(*parts)


def _picked(column: Any, pick: Pick, empty: str | None = None) -> list[ColumnElement[bool]]:
    where: list[ColumnElement[bool]] = []
    if pick.only:
        where.append(_matches(column, pick.only, empty))
    if pick.hide:
        # NOT IN alone would also drop the lines with no value (NULL), which are not hidden.
        ids = [v for v in pick.hide if v != empty]
        kept = column.not_in(ids) if ids else true()
        if empty is not None and empty in pick.hide:
            where.append(and_(column.is_not(None), kept))
        else:
            where.append(or_(column.is_(None), kept))
    return where


def _by_bank(family_id: uuid.UUID, pick: Pick) -> list[ColumnElement[bool]]:
    def accounts_of(banks: tuple[Value, ...]) -> Select[uuid.UUID]:
        return select(Account.id).where(
            Account.family_id == family_id, Account.bank.in_([str(b) for b in banks])
        )

    where: list[ColumnElement[bool]] = []
    if pick.only:
        where.append(Transaction.account_id.in_(accounts_of(pick.only)))
    if pick.hide:
        where.append(not_(Transaction.account_id.in_(accounts_of(pick.hide))))
    return where


async def _where(
    db: AsyncSession, family_id: uuid.UUID, f: Filters, review: ReviewStatus
) -> list[ColumnElement[bool]]:
    where = [Transaction.family_id == family_id, Transaction.review == review]
    if f.month is not None:
        lo, hi = month_range(f.month, await month_start_day(db, family_id))
        where.append(Transaction.date.between(lo, hi))
    if f.date_from is not None:
        where.append(Transaction.date >= f.date_from)
    if f.date_to is not None:
        where.append(Transaction.date <= f.date_to)
    if f.direction == "out":
        where.append(Transaction.amount < 0)
    elif f.direction == "in":
        where.append(Transaction.amount > 0)
    if f.account_currency is not None:
        where.append(Transaction.currency == f.account_currency)
    if f.kinds:
        where.append(Transaction.kind.in_(f.kinds))
    where += _picked(Transaction.category_id, f.categories, NO_CATEGORY_KEY)
    where += _picked(Transaction.member_id, f.members, HOUSEHOLD)
    where += _picked(Transaction.account_id, f.accounts)
    where += _by_bank(family_id, f.banks)
    if f.card_bill is not None:
        where.append(Transaction.card_bill == f.card_bill)
    if f.q and (text := f.q.strip()):
        # The person's words are matched literally, so % and _ mean themselves.
        pattern = "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where.append(Transaction.description.ilike(pattern, escape="\\"))
    return where


async def list_transactions(
    db: AsyncSession,
    family_id: uuid.UUID,
    filters: Filters | None = None,
    *,
    limit: int = 50,
    offset: int = 0,
    currency: Currency | None = None,
    review: ReviewStatus = ReviewStatus.APPROVED,
    sort: Sort = "date",
) -> TransactionPage:
    where = await _where(db, family_id, filters or Filters(), review)
    total = await db.scalar(select(func.count()).select_from(Transaction).where(*where))
    query = (
        select(Transaction, Account.name, Category.name)
        .join(Account, Account.id == Transaction.account_id)
        .outerjoin(Category, Category.id == Transaction.category_id)
    )
    if currency is not None and sort in ("amount", "-amount"):
        # Amounts in several currencies sort only once converted, so the page is picked here.
        ids = await _by_converted_amount(db, where, currency, descending=sort == "-amount")
        page = ids[offset : offset + limit]
        rows = await db.execute(query.where(Transaction.id.in_(page)))
        place = {id_: n for n, id_ in enumerate(page)}
        found = sorted(rows, key=lambda r: place[r[0].id])
    else:
        order = _ORDER.get(sort, (Transaction.date.desc(), Transaction.created_at.desc()))
        rows = await db.execute(
            query.where(*where)
            .order_by(*order, Transaction.date.desc(), Transaction.id)
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


async def _by_converted_amount(
    db: AsyncSession,
    where: list[ColumnElement[bool]],
    currency: Currency,
    *,
    descending: bool,
) -> list[uuid.UUID]:
    """Every matching line's id, ordered by its amount in the chosen currency."""
    lines = list(
        await db.execute(
            select(Transaction.id, Transaction.amount, Transaction.currency, Transaction.date)
            .where(*where)
            .order_by(Transaction.date.desc(), Transaction.id)
        )
    )
    dates = [line.date for line in lines]
    conv = await converter(db, currency, min(dates, default=None), max(dates, default=None))
    amount = {line.id: conv(line.amount, line.currency, line.date) for line in lines}
    # A stable sort keeps the newest first among equal amounts.
    ordered = sorted(lines, key=lambda line: amount[line.id], reverse=descending)
    return [line.id for line in ordered]


class _Sum:
    def __init__(self, id: uuid.UUID | None = None, name: str = "") -> None:
        self.id, self.name = id, name
        self.flow = Flow()
        self.count = 0

    def add(self, amount: Decimal, investment: bool = False) -> None:
        self.flow.add(amount, investment)
        self.count += 1

    @property
    def spending(self) -> Decimal:
        return self.flow.total_spending

    @property
    def income(self) -> Decimal:
        return self.flow.total_income

    def group(self) -> GroupTotal:
        return GroupTotal(
            id=self.id,
            name=self.name,
            income=self.income,
            spending=self.spending,
            invested_in=self.flow.put_in,
            invested_out=self.flow.taken_out,
            count=self.count,
        )


def _biggest_first(groups: dict[object, _Sum]) -> list[GroupTotal]:
    ordered = sorted(groups.values(), key=lambda g: (-g.spending, -g.income, g.name))
    return [g.group() for g in ordered]


class _CurrencySum:
    def __init__(self) -> None:
        self.all = _Sum()
        self.days: dict[date, Decimal] = {}
        self.by: dict[str, dict[object, _Sum]] = {
            "categories": {},
            "members": {},
            "accounts": {},
        }

    def add(
        self,
        amount: Decimal,
        day: date,
        keys: dict[str, tuple[uuid.UUID | None, str]],
        investment: bool = False,
    ) -> None:
        self.all.add(amount, investment)
        self.days[day] = self.days.get(day, Decimal("0")) + amount
        for dimension, (key, name) in keys.items():
            self.by[dimension].setdefault(key, _Sum(key, name)).add(amount, investment)

    def totals(self, currency: Currency) -> CurrencyTotals:
        return CurrencyTotals(
            currency=currency,
            income=self.all.income,
            spending=self.all.spending,
            balance=self.all.income - self.all.spending,
            invested_in=self.all.flow.put_in,
            invested_out=self.all.flow.taken_out,
            count=self.all.count,
            categories=_biggest_first(self.by["categories"]),
            members=_biggest_first(self.by["members"]),
            accounts=_biggest_first(self.by["accounts"]),
            days=[DayTotal(date=d, total=t) for d, t in sorted(self.days.items(), reverse=True)],
        )


# Only spending and income are added up: money between the family's own accounts, and what
# still waits to be confirmed as such, may be listed but never counts.
COUNTED = (TxKind.REGULAR, TxKind.INVESTMENT)


async def totals(
    db: AsyncSession,
    family_id: uuid.UUID,
    filters: Filters | None = None,
    currency: Currency | None = None,
) -> TransactionTotals:
    """Entradas and saídas of every line the list would show, by group and by day."""
    f = filters or Filters()
    counted = [k for k in (f.kinds or COUNTED) if k in COUNTED]
    if not counted:
        return TransactionTotals(count=0, currencies=[])
    where = await _where(db, family_id, replace(f, kinds=counted), ReviewStatus.APPROVED)
    rows = list(
        await db.execute(
            select(
                Transaction.amount,
                Transaction.currency,
                Transaction.date,
                Transaction.kind,
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
    for amount, original, day, kind, cat_id, cat, member_id, person, acc_id, acc in rows:
        shown = conv.currency(original)
        keys = {
            "categories": (cat_id, cat or NO_CATEGORY),
            "members": (member_id, person or HOUSEHOLD_NAME),
            "accounts": (acc_id, acc),
        }
        sums.setdefault(shown, _CurrencySum()).add(
            conv(amount, original, day), day, keys, kind == TxKind.INVESTMENT
        )
    return TransactionTotals(
        count=len(rows),
        currencies=[s.totals(c) for c, s in sorted(sums.items(), key=lambda kv: kv[0].value)],
    )


async def latest_month(db: AsyncSession, family_id: uuid.UUID) -> LatestMonth:
    """The month of the newest line that counts, so Transações opens where the data is."""
    last = await db.scalar(
        select(func.max(Transaction.date)).where(
            Transaction.family_id == family_id,
            Transaction.review == ReviewStatus.APPROVED,
            Transaction.kind.in_(COUNTED),
        )
    )
    if last is None:
        return LatestMonth(month=None)
    return LatestMonth(month=month_of(last, await month_start_day(db, family_id)))


async def in_every_currency(
    db: AsyncSession, family_id: uuid.UUID, tx_id: uuid.UUID
) -> LineCurrencies:
    """A line's amount in BRL, EUR and USD with the ECB rate of its day."""
    tx = await _get(db, family_id, tx_id)
    conv = await converter(db, tx.currency, tx.date, tx.date)
    amounts = []
    for target in Currency:
        to = replace(conv, target=target)
        amounts.append(
            CurrencyAmount(
                currency=target,
                amount=to(tx.amount, tx.currency, tx.date),
                rate=to.rate(tx.currency, tx.date),
            )
        )
    return LineCurrencies(currency=tx.currency, rate_date=conv.rate_day(tx.date), amounts=amounts)


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
    await follow_category(db, tx, category)
    if apply_to_merchant and (key := merchant_key(tx.description)):
        await db.execute(
            insert(CategoryRule)
            .values(id=uuid.uuid4(), family_id=family_id, merchant_key=key, category_id=category.id)
            .on_conflict_do_update(
                constraint="uq_rule_family_merchant", set_={"category_id": category.id}
            )
        )


async def follow_category(db: AsyncSession, tx: Transaction, category: Category) -> None:
    """Puts the line in the category, and on the side its kind says: a movimentação
    category takes it out of spending and income, any other brings it back."""
    kind = TxKind.REGULAR
    if category.system_key == CARD_PAYMENT:
        # Out of spending, except when the card isn't in the app (card_payments).
        kind = card_payments.kind_for(await card_payments.card_in_app(db, tx))
    elif category.kind == CategoryKind.TRANSFER:
        kind = TxKind.TRANSFER
    elif category.system_key == INVESTMENT:
        kind = TxKind.INVESTMENT
    if kind != TxKind.TRANSFER:
        await _unpair(db, tx)
    tx.kind = kind
    tx.category_id = category.id


def _moves_money(category: Category) -> bool:
    return category.kind == CategoryKind.TRANSFER or category.system_key in (
        INVESTMENT,
        CARD_PAYMENT,
    )


async def delete_transaction(db: AsyncSession, family_id: uuid.UUID, tx_id: uuid.UUID) -> None:
    """Removes a line for good; the other side of a transfer goes back to waiting."""
    tx = await _get(db, family_id, tx_id)
    await delete_lines(db, [tx])


async def delete_lines(db: AsyncSession, txs: list[Transaction]) -> None:
    """Removes lines for good; the other side of each transfer goes back to waiting."""
    for tx in txs:
        await _unpair(db, tx)
    for tx in txs:
        await db.delete(tx)
    await db.flush()


async def set_kind(
    db: AsyncSession, family_id: uuid.UUID, tx_id: uuid.UUID, data: KindUpdate
) -> TransactionOut:
    """The person says what a line was: spending/income, investment or own transfer."""
    tx = await _get(db, family_id, tx_id)
    previous = tx.category_id
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
        card = await card_payments.category_if_bill_payment(db, tx)
        if card is not None and card.id != previous:
            # Called a transfer, but it paid a card: say so (unless the person just took
            # it out of the card payment category).
            tx.category_id = card.id
            if tx.transfer_pair_id and (other := await db.get(Transaction, tx.transfer_pair_id)):
                other.category_id = card.id
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
        card_bill=tx.card_bill,
        installment=tx.installment,
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
