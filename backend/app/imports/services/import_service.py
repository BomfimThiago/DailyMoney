"""Statement upload: read the file, show what would come in, import after confirmation."""

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.accounts.services import account_service
from app.categories.services import category_service
from app.categories.services.categorize import TRANSFER
from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.families.models import Currency, Member, User
from app.imports.models import ImportStatus, StatementImport
from app.imports.schemas import (
    AccountChoice,
    AccountRef,
    GroupCounts,
    ImportPreview,
    PreviewGroup,
    PreviewRow,
    RowErrorOut,
    RowStatus,
)
from app.imports.services.dedup import NEAR_DAYS, Existing, Incoming, find_duplicates, source_keys
from app.imports.services.self_transfer import looks_like_self_transfer
from app.imports.services.transfers import MAX_DAYS, Candidate, pair_transfers
from app.statements.parsing.reader import read_statement
from app.statements.parsing.types import ParsedStatement
from app.transactions.models import Transaction, TxKind

_CURRENCY_ERROR = "Não foi possível saber a moeda"


class ChoiceError(AppError):
    status_code = 422
    code = "ACCOUNT_CHOICE"


@dataclass
class _Row:
    date: date
    description: str
    amount: Decimal
    currency: str
    raw: str
    source_key: str
    external_id: str | None
    kind: TxKind


@dataclass
class _Planned:
    index: int
    status: RowStatus
    kind: TxKind
    category: str | None
    pair_id: uuid.UUID | None = None


@dataclass
class _GroupPlan:
    currency: str
    account: Account | None
    first_import: bool
    rows: list[_Planned] = field(default_factory=list)


# ── upload ───────────────────────────────────────────────────────────────────


async def create_import(
    db: AsyncSession,
    user: User,
    filename: str,
    data: bytes,
    default_currency: Currency | None = None,
) -> StatementImport:
    # Scanned PDFs take seconds of OCR; keep the event loop free for other requests.
    statement = await asyncio.to_thread(read_statement, filename, data, default_currency)
    return await store_statement(db, user.family_id, user.id, filename, statement)


async def store_statement(
    db: AsyncSession,
    family_id: uuid.UUID,
    user_id: uuid.UUID | None,
    filename: str,
    statement: ParsedStatement,
) -> StatementImport:
    """Keep the rows read from a statement (or a connected bank) until they are confirmed."""
    keys = source_keys([r.raw for r in statement.rows])
    rows = [
        {
            "date": r.date.isoformat(),
            "description": r.description[:500],
            "amount": str(r.amount),
            "currency": r.currency,
            "raw": r.raw,
            "source_key": key,
            "external_id": r.external_id[:200] if r.external_id else None,
            "kind": r.kind,
        }
        for r, key in zip(statement.rows, keys, strict=True)
    ]
    dates = [r.date for r in statement.rows]
    imp = StatementImport(
        family_id=family_id,
        user_id=user_id,
        filename=filename[:255],
        format=statement.format,
        bank=statement.bank,
        is_card=statement.is_card,
        status=ImportStatus.PREVIEW,
        period_start=min(dates) if dates else None,
        period_end=max(dates) if dates else None,
        rows=rows,
        errors=[{"row": e.row, "message": e.message} for e in statement.errors],
    )
    db.add(imp)
    await db.flush()
    return imp


async def get_import(
    db: AsyncSession, family_id: uuid.UUID, import_id: uuid.UUID
) -> StatementImport:
    imp = await db.get(StatementImport, import_id)
    if imp is None or imp.family_id != family_id:
        raise NotFoundError("Envio não encontrado")
    return imp


async def list_imports(db: AsyncSession, family_id: uuid.UUID) -> list[StatementImport]:
    rows = await db.scalars(
        select(StatementImport)
        .where(
            StatementImport.family_id == family_id,
            StatementImport.status == ImportStatus.IMPORTED,
            # Reads of connected banks show on Conexões, not as sent statements.
            StatementImport.format.not_in(("eb", "pluggy")),
        )
        .order_by(StatementImport.created_at.desc())
        .limit(30)
    )
    return list(rows)


# ── preview ──────────────────────────────────────────────────────────────────


async def preview(
    db: AsyncSession,
    imp: StatementImport,
    chosen: dict[Currency, uuid.UUID | None] | None = None,
    since: date | None = None,
) -> ImportPreview:
    accounts: dict[str, Account | None] = {}
    for currency, account_id in (chosen or {}).items():
        accounts[currency.value] = (
            await _account_in_currency(db, imp.family_id, account_id, currency.value)
            if account_id
            else None
        )
    plans = await _plan(db, imp, accounts, since) if imp.status == ImportStatus.PREVIEW else []
    rows = _rows(imp)
    preview_rows = [
        PreviewRow(
            index=p.index,
            date=rows[p.index].date,
            description=rows[p.index].description,
            amount=rows[p.index].amount,
            currency=Currency(rows[p.index].currency),
            category=p.category,
            status=p.status,
            kind=p.kind,
        )
        for plan in plans
        for p in plan.rows
    ]
    preview_rows.sort(key=lambda r: (r.date, r.index), reverse=True)
    errors = [RowErrorOut(row=e["row"], message=e["message"]) for e in imp.errors]
    return ImportPreview(
        id=imp.id,
        filename=imp.filename,
        format=imp.format,
        bank=imp.bank,
        is_card=imp.is_card,
        status=imp.status,
        period_start=imp.period_start,
        period_end=imp.period_end,
        needs_currency=not rows
        and bool(errors)
        and all(_CURRENCY_ERROR in e.message for e in errors),
        groups=[
            PreviewGroup(
                currency=Currency(plan.currency),
                account=AccountRef(id=plan.account.id, name=plan.account.name)
                if plan.account
                else None,
                suggested_name=_suggested_name(imp, plan.currency),
                first_import=plan.first_import,
                counts=_counts(plan),
            )
            for plan in plans
        ],
        rows=preview_rows,
        errors=errors,
    )


def _counts(plan: _GroupPlan) -> GroupCounts:
    counts = GroupCounts()
    for p in plan.rows:
        setattr(counts, p.status, getattr(counts, p.status) + 1)
    return counts


def _suggested_name(imp: StatementImport, currency: str) -> str:
    bank = imp.bank or "Conta"
    return f"{bank} cartão" if imp.is_card else f"{bank} {currency}"


def _rows(imp: StatementImport) -> list[_Row]:
    return [
        _Row(
            date=date.fromisoformat(r["date"]),
            description=r["description"],
            amount=Decimal(r["amount"]),
            currency=r["currency"],
            raw=r["raw"],
            source_key=r["source_key"],
            external_id=r["external_id"],
            # Previews saved before kinds existed only had the bank's transfer flag.
            kind=TxKind(r.get("kind") or ("transfer" if r.get("bank_transfer") else "regular")),
        )
        for r in (imp.rows or [])
    ]


async def _plan(
    db: AsyncSession,
    imp: StatementImport,
    chosen: dict[str, Account | None],
    since: date | None,
) -> list[_GroupPlan]:
    rows = _rows(imp)
    categorizer = await category_service.categorizer_for(db, imp.family_id)
    # Users carry the full name; members often only a first name.
    names = [
        *await db.scalars(select(User.name).where(User.family_id == imp.family_id)),
        *await db.scalars(select(Member.name).where(Member.family_id == imp.family_id)),
    ]
    by_currency: dict[str, list[int]] = {}
    for i, row in enumerate(rows):
        by_currency.setdefault(row.currency, []).append(i)

    plans = []
    for currency, indexes in sorted(by_currency.items()):
        account = (
            chosen[currency] if currency in chosen else await _matching_account(db, imp, currency)
        )
        lo = min(rows[i].date for i in indexes)
        hi = max(rows[i].date for i in indexes)
        first_import = account is None or not await _has_transactions(db, account.id)
        plan = _GroupPlan(currency=currency, account=account, first_import=first_import)

        existing = await _existing(
            db, account, lo - timedelta(days=NEAR_DAYS), hi + timedelta(days=NEAR_DAYS)
        )
        duplicates = find_duplicates(
            [
                Incoming(
                    date=rows[i].date,
                    amount=rows[i].amount,
                    description=rows[i].description,
                    source_key=rows[i].source_key,
                    external_id=rows[i].external_id,
                    source_format=imp.format,
                )
                for i in indexes
            ],
            existing,
        )
        statuses: dict[int, RowStatus] = {}
        kinds: dict[int, TxKind] = {}
        for i, is_dup in zip(indexes, duplicates, strict=True):
            if first_import and since and rows[i].date < since:
                statuses[i] = "skipped"
            elif is_dup:
                statuses[i] = "duplicate"
            else:
                statuses[i] = "new"
            kinds[i] = rows[i].kind
            if kinds[i] == TxKind.REGULAR and looks_like_self_transfer(rows[i].description, names):
                kinds[i] = TxKind.PENDING

        others = await _transfer_candidates(
            db,
            imp.family_id,
            account,
            currency,
            lo - timedelta(days=MAX_DAYS),
            hi + timedelta(days=MAX_DAYS),
        )
        pairs = pair_transfers(
            [
                Candidate(
                    id=str(i),
                    account_id=str(account.id) if account else "new",
                    date=rows[i].date,
                    amount=rows[i].amount,
                    currency=currency,
                )
                for i in indexes
                if statuses[i] == "new" and kinds[i] != TxKind.INVESTMENT
            ],
            others,
        )
        for i in indexes:
            pair = pairs.get(str(i))
            kind = TxKind.TRANSFER if pair else kinds[i]
            category = (
                categorizer.category_for(
                    rows[i].description, rows[i].amount, is_transfer=kind == TxKind.TRANSFER
                )
                if statuses[i] == "new" and kind in (TxKind.REGULAR, TxKind.TRANSFER)
                else None
            )
            plan.rows.append(
                _Planned(
                    index=i,
                    status=statuses[i],
                    kind=kind,
                    category=category,
                    pair_id=uuid.UUID(pair) if pair else None,
                )
            )
        plans.append(plan)
    return plans


async def _matching_account(
    db: AsyncSession, imp: StatementImport, currency: str
) -> Account | None:
    if not imp.bank:
        return None
    account: Account | None = await db.scalar(
        select(Account)
        .where(
            Account.family_id == imp.family_id,
            Account.bank == imp.bank,
            Account.currency == Currency(currency),
            Account.is_card == imp.is_card,
        )
        .order_by(Account.created_at)
        .limit(1)
    )
    return account


async def _account_in_currency(
    db: AsyncSession, family_id: uuid.UUID, account_id: uuid.UUID, currency: str
) -> Account:
    account = await account_service.get_account(db, family_id, account_id)
    if account.currency.value != currency:
        raise ChoiceError(
            f"A conta {account.name} é em {account.currency.value}, não em {currency}"
        )
    return account


async def _has_transactions(db: AsyncSession, account_id: uuid.UUID) -> bool:
    count = await db.scalar(
        select(func.count()).select_from(Transaction).where(Transaction.account_id == account_id)
    )
    return bool(count)


async def _existing(
    db: AsyncSession, account: Account | None, lo: date, hi: date
) -> list[Existing]:
    if account is None:
        return []
    rows = await db.scalars(
        select(Transaction).where(
            Transaction.account_id == account.id, Transaction.date.between(lo, hi)
        )
    )
    return [
        Existing(
            id=str(t.id),
            date=t.date,
            amount=t.amount,
            description=t.description,
            source_key=t.source_key,
            external_id=t.external_id,
            source_format=t.source_format,
        )
        for t in rows
    ]


async def _transfer_candidates(
    db: AsyncSession,
    family_id: uuid.UUID,
    account: Account | None,
    currency: str,
    lo: date,
    hi: date,
) -> list[Candidate]:
    query = select(Transaction).where(
        Transaction.family_id == family_id,
        Transaction.currency == Currency(currency),
        Transaction.kind != TxKind.INVESTMENT,
        Transaction.transfer_pair_id.is_(None),
        Transaction.date.between(lo, hi),
    )
    if account is not None:
        query = query.where(Transaction.account_id != account.id)
    return [
        Candidate(
            id=str(t.id),
            account_id=str(t.account_id),
            date=t.date,
            amount=t.amount,
            currency=currency,
        )
        for t in await db.scalars(query)
    ]


# ── confirm / cancel ─────────────────────────────────────────────────────────


async def confirm(
    db: AsyncSession,
    user: User,
    imp: StatementImport,
    choices: list[AccountChoice],
    since: date | None,
) -> StatementImport:
    if imp.status != ImportStatus.PREVIEW:
        raise ConflictError("Este envio já foi importado ou cancelado")
    currencies = sorted({r.currency for r in _rows(imp)})
    if not currencies:
        raise ChoiceError("Este arquivo não tem nenhuma transação para importar")
    by_currency = {c.currency.value: c for c in choices}
    missing = [c for c in currencies if c not in by_currency]
    if missing:
        raise ChoiceError(f"Escolha a conta para os valores em {', '.join(missing)}")

    accounts: dict[str, Account | None] = {}
    for currency in currencies:
        choice = by_currency[currency]
        if choice.account_id is not None:
            accounts[currency] = await _account_in_currency(
                db, imp.family_id, choice.account_id, currency
            )
        else:
            assert choice.new_account is not None
            member_id = choice.new_account.member_id or await _member_of(db, user)
            accounts[currency] = await account_service.create_account(
                db,
                imp.family_id,
                name=choice.new_account.name,
                bank=imp.bank or "Outro",
                currency=Currency(currency),
                is_card=imp.is_card,
                member_id=member_id,
            )

    plans = await _plan(db, imp, accounts, since)
    categories = await category_service.categories_by_name(db, imp.family_id)
    transfer_category = categories.get(TRANSFER)
    rows = _rows(imp)
    counts = GroupCounts()
    for plan in plans:
        account = plan.account
        assert account is not None
        for p in plan.rows:
            setattr(counts, p.status, getattr(counts, p.status) + 1)
            if p.status != "new":
                continue
            row = rows[p.index]
            category = categories.get(p.category) if p.category else None
            tx = Transaction(
                id=uuid.uuid4(),
                family_id=imp.family_id,
                account_id=account.id,
                member_id=account.member_id,
                category_id=category.id if category else None,
                import_id=imp.id,
                date=row.date,
                description=row.description,
                amount=row.amount,
                currency=Currency(row.currency),
                external_id=row.external_id,
                source_key=row.source_key,
                source_format=imp.format,
                kind=p.kind,
                transfer_pair_id=p.pair_id,
            )
            db.add(tx)
            if p.pair_id:
                await db.flush()
                other = await db.get(Transaction, p.pair_id)
                if other is not None:
                    other.kind = TxKind.TRANSFER
                    other.transfer_pair_id = tx.id
                    if transfer_category is not None:
                        other.category_id = transfer_category.id

    imp.imported_count = counts.new
    imp.duplicate_count = counts.duplicate
    imp.skipped_count = counts.skipped
    _finish(imp, ImportStatus.IMPORTED)
    await db.flush()
    return imp


async def cancel(imp: StatementImport) -> StatementImport:
    if imp.status != ImportStatus.PREVIEW:
        raise ConflictError("Este envio já foi importado ou cancelado")
    _finish(imp, ImportStatus.CANCELLED)
    return imp


def _finish(imp: StatementImport, status: ImportStatus) -> None:
    imp.status = status
    # The rows now live as transactions (or were dropped); no second copy is kept.
    imp.rows = None
    imp.finished_at = datetime.now(UTC)


async def _member_of(db: AsyncSession, user: User) -> uuid.UUID | None:
    member_id: uuid.UUID | None = await db.scalar(
        select(Member.id).where(Member.user_id == user.id)
    )
    return member_id
