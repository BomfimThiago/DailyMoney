import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.core.exceptions import ConflictError, NotFoundError
from app.families.models import Currency, Member


async def list_accounts(db: AsyncSession, family_id: uuid.UUID) -> list[Account]:
    rows = await db.scalars(
        select(Account).where(Account.family_id == family_id).order_by(Account.name)
    )
    return list(rows)


async def get_account(db: AsyncSession, family_id: uuid.UUID, account_id: uuid.UUID) -> Account:
    account = await db.get(Account, account_id)
    if account is None or account.family_id != family_id:
        raise NotFoundError("Conta não encontrada")
    return account


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
        member = await db.get(Member, member_id)
        if member is None or member.family_id != family_id:
            raise NotFoundError("Membro não encontrado")
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
