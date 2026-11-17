import uuid

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.core.exceptions import ConflictError
from app.core.family_scope import get_in_family
from app.families.models import Currency, Member
from app.transactions.models import Transaction


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
    """Changes who the account belongs to. Its lines follow: each line's owner is the
    account's owner, so filters and totals by person stay consistent."""
    account = await get_account(db, family_id, account_id)
    if member_id is not None:
        await get_in_family(db, Member, family_id, member_id, "Membro não encontrado")
    account.member_id = member_id
    await db.execute(
        update(Transaction).where(Transaction.account_id == account.id).values(member_id=member_id)
    )
    await db.flush()
    return account
