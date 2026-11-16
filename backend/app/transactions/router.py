import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, DbSession
from app.families.models import Currency
from app.transactions.models import TxKind
from app.transactions.schemas import (
    Analysis,
    InvestmentOverview,
    KindUpdate,
    MonthDashboard,
    MonthSummary,
    ReviewDecision,
    ReviewQueue,
    ReviewResult,
    TransactionOut,
    TransactionPage,
    TransactionUpdate,
    TransferOverview,
)
from app.transactions.services import analysis_service, overview_service, transaction_service

router = APIRouter(prefix="/transactions", tags=["transactions"])

Month = Annotated[str, Query(pattern=r"^\d{4}-\d{2}$", examples=["2026-10"])]
# Show every amount in this currency (each line converted with its day's ECB rate).
# Without it, amounts stay in each account's own currency.
ShowIn = Annotated[Currency | None, Query()]


@router.get("", response_model=TransactionPage)
async def list_transactions(
    user: CurrentUser,
    db: DbSession,
    account_id: uuid.UUID | None = None,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
    kind: Annotated[list[TxKind] | None, Query()] = None,
    category_id: uuid.UUID | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    currency: ShowIn = None,
) -> TransactionPage:
    return await transaction_service.list_transactions(
        db,
        user.family_id,
        account_id=account_id,
        month=month,
        kinds=kind,
        category_id=category_id,
        q=q,
        limit=limit,
        offset=offset,
        currency=currency,
    )


@router.get("/summary", response_model=MonthSummary)
async def month_summary(
    user: CurrentUser, db: DbSession, month: Month, currency: ShowIn = None
) -> MonthSummary:
    return await overview_service.month_summary(db, user.family_id, month, currency)


@router.get("/dashboard", response_model=MonthDashboard)
async def month_dashboard(
    user: CurrentUser, db: DbSession, month: Month, currency: ShowIn = None
) -> MonthDashboard:
    return await overview_service.month_dashboard(db, user.family_id, month, currency)


@router.get("/analysis", response_model=Analysis)
async def analysis(
    user: CurrentUser,
    db: DbSession,
    month: Month,
    months: Annotated[int, Query(ge=1, le=12)] = 6,
    currency: ShowIn = None,
) -> Analysis:
    return await analysis_service.analysis(db, user.family_id, month, months, currency=currency)


@router.get("/investments", response_model=InvestmentOverview)
async def investments(
    user: CurrentUser, db: DbSession, month: Month, currency: ShowIn = None
) -> InvestmentOverview:
    return await overview_service.investments(db, user.family_id, month, currency)


@router.get("/transfers", response_model=TransferOverview)
async def transfers(user: CurrentUser, db: DbSession, month: Month) -> TransferOverview:
    return await overview_service.transfers(db, user.family_id, month)


@router.get("/review", response_model=ReviewQueue)
async def review_queue(user: CurrentUser, db: DbSession, currency: ShowIn = None) -> ReviewQueue:
    """Imported lines waiting for approval, by upload or bank read."""
    return await transaction_service.review_queue(db, user.family_id, currency)


@router.post("/review", response_model=ReviewResult)
async def decide(data: ReviewDecision, user: CurrentUser, db: DbSession) -> ReviewResult:
    """Approve imported lines (they start counting) or turn them down."""
    result = await transaction_service.decide(db, user.family_id, data)
    await db.commit()
    return result


@router.patch("/{tx_id}", response_model=TransactionOut)
async def update_transaction(
    tx_id: uuid.UUID, data: TransactionUpdate, user: CurrentUser, db: DbSession
) -> TransactionOut:
    result = await transaction_service.update_transaction(db, user.family_id, tx_id, data)
    await db.commit()
    return result


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(tx_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    await transaction_service.delete_transaction(db, user.family_id, tx_id)
    await db.commit()


@router.put("/{tx_id}/kind", response_model=TransactionOut)
async def set_kind(
    tx_id: uuid.UUID, data: KindUpdate, user: CurrentUser, db: DbSession
) -> TransactionOut:
    result = await transaction_service.set_kind(db, user.family_id, tx_id, data)
    await db.commit()
    return result
