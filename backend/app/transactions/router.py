import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.transactions.schemas import TransactionOut, TransactionPage, TransactionUpdate
from app.transactions.services import transaction_service

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=TransactionPage)
async def list_transactions(
    user: CurrentUser,
    db: DbSession,
    account_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TransactionPage:
    return await transaction_service.list_transactions(
        db, user.family_id, account_id=account_id, limit=limit, offset=offset
    )


@router.patch("/{tx_id}", response_model=TransactionOut)
async def update_transaction(
    tx_id: uuid.UUID, data: TransactionUpdate, user: CurrentUser, db: DbSession
) -> TransactionOut:
    result = await transaction_service.update_transaction(db, user.family_id, tx_id, data)
    await db.commit()
    return result
