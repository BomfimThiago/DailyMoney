import uuid

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.core.exceptions import AppError, ConflictError
from app.core.family_scope import get_in_family
from app.families.models import Currency, Member
from app.transactions.models import Transaction
from app.transactions.services import card_month


async def list_accounts(db: AsyncSession, family_id: uuid.UUID) -> list[Account]:
    rows = await db.scalars(
        select(Account).where(Account.family_id == family_id).order_by(Account.name)
    )
    return list(rows)


async def get_account(db: AsyncSession, family_id: uuid.UUID, account_id: uuid.UUID) -> Account:
    return await get_in_family(db, Account, family_id, account_id, "Conta não encontrada")


async def create_account(
    db: AsyncSession,
    family_id: uuid.UUID,
    *,
    name: str,
    bank: str,
    currency: Currency,
    is_card: bool,
    member_id: uuid.UUID | None,
) -> Account:
    if member_id is not None:
        await get_in_family(db, Member, family_id, member_id, "Membro não encontrado")
    account = Account(
        family_id=family_id,
        name=name.strip(),
        bank=bank,
        currency=currency,
        is_card=is_card,
        member_id=member_id,
    )
    db.add(account)
    try:
        async with db.begin_nested():
            await db.flush()
    except IntegrityError as exc:
        raise ConflictError(f"Já existe uma conta chamada {name.strip()}") from exc
    return account


async def set_owner(
    db: AsyncSession, family_id: uuid.UUID, account_id: uuid.UUID, member_id: uuid.UUID | None
) -> Account:
    """Changes who the account belongs to. Its lines that were the old owner's follow;
    a line the person gave to someone else on purpose keeps that person."""
    account = await get_account(db, family_id, account_id)
    if member_id is not None:
        await get_in_family(db, Member, family_id, member_id, "Membro não encontrado")
    old = account.member_id
    account.member_id = member_id
    await db.execute(
        update(Transaction)
        .where(
            Transaction.account_id == account.id,
            Transaction.member_id.is_(None) if old is None else Transaction.member_id == old,
        )
        .values(member_id=member_id)
    )
    await db.flush()
    return account


class NotACardError(AppError):
    status_code = 422
    code = "NOT_A_CARD"


async def set_bill_days(
    db: AsyncSession,
    family_id: uuid.UUID,
    account_id: uuid.UUID,
    close_day: int | None,
    due_day: int | None,
) -> Account:
    """The card's closing and due days; its purchases move to the month of their bill."""
    account = await get_account(db, family_id, account_id)
    if not account.is_card and (close_day is not None or due_day is not None):
        raise NotACardError("Só cartões de crédito têm dia de fechamento e de vencimento")
    account.bill_close_day, account.bill_due_day = close_day, due_day
    await db.flush()
    await card_month.recount(db, family_id, account.id)
    return account
