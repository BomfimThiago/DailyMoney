import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.core.exceptions import ConflictError
from app.core.family_scope import get_in_family
from app.families.models import Currency, Member


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
