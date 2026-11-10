import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.banks.models import BankRequest
from app.banks.schemas import BankRequestIn


async def list_requests(db: AsyncSession, family_id: uuid.UUID) -> list[BankRequest]:
    rows = await db.scalars(
        select(BankRequest)
        .where(BankRequest.family_id == family_id)
        .order_by(BankRequest.created_at.desc())
    )
    return list(rows)


async def ask_for_bank(
    db: AsyncSession, family_id: uuid.UUID, user_id: uuid.UUID, data: BankRequestIn
) -> BankRequest:
    # Asking again for the same bank (any letter case) keeps the first request.
    existing = await db.scalar(
        select(BankRequest).where(
            BankRequest.family_id == family_id,
            func.lower(BankRequest.bank_name) == data.bank_name.lower(),
        )
    )
    if existing is not None:
        return existing
    request = BankRequest(
        family_id=family_id, user_id=user_id, bank_name=data.bank_name, note=data.note or None
    )
    db.add(request)
    await db.flush()
    await db.refresh(request)
    return request
