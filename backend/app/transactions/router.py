import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.transactions.models import TxKind
from app.transactions.schemas import (
    InvestmentOverview,
    KindUpdate,
    MonthSummary,
    TransactionOut,
    TransactionPage,
    TransactionUpdate,
    TransferOverview,
)
from app.transactions.services import overview_service, transaction_service

router = APIRouter(prefix="/transactions", tags=["transactions"])

Month = Annotated[str, Query(pattern=r"^\d{4}-\d{2}$", examples=["2026-10"])]


@router.get("", response_model=TransactionPage)
async def list_transactions(
    user: CurrentUser,
    db: DbSession,
    account_id: uuid.UUID | None = None,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
    kind: Annotated[list[TxKind] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TransactionPage:
    return await transaction_service.list_transactions(
        db,
        user.family_id,
        account_id=account_id,
        month=month,
        kinds=kind,
        limit=limit,
        offset=offset,
    )


@router.get("/summary", response_model=MonthSummary)
async def month_summary(user: CurrentUser, db: DbSession, month: Month) -> MonthSummary:
    return await overview_service.month_summary(db, user.family_id, month)


@router.get("/investments", response_model=InvestmentOverview)
async def investments(user: CurrentUser, db: DbSession, month: Month) -> InvestmentOverview:
    return await overview_service.investments(db, user.family_id, month)


@router.get("/transfers", response_model=TransferOverview)
async def transfers(user: CurrentUser, db: DbSession, month: Month) -> TransferOverview:
    return await overview_service.transfers(db, user.family_id, month)


@router.patch("/{tx_id}", response_model=TransactionOut)
async def update_transaction(
    tx_id: uuid.UUID, data: TransactionUpdate, user: CurrentUser, db: DbSession
) -> TransactionOut:
    result = await transaction_service.update_transaction(db, user.family_id, tx_id, data)
    await db.commit()
    return result


@router.put("/{tx_id}/kind", response_model=TransactionOut)
async def set_kind(
    tx_id: uuid.UUID, data: KindUpdate, user: CurrentUser, db: DbSession
) -> TransactionOut:
    result = await transaction_service.set_kind(db, user.family_id, tx_id, data)
    await db.commit()
    return result
