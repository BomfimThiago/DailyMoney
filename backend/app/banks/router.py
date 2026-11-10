from fastapi import APIRouter, status

from app.banks.schemas import BankRequestIn, BankRequestOut
from app.banks.services import bank_request_service
from app.core.deps import CurrentUser, DbSession

router = APIRouter(prefix="/bank-requests", tags=["banks"])


@router.get("", response_model=list[BankRequestOut])
async def list_bank_requests(user: CurrentUser, db: DbSession) -> list[BankRequestOut]:
    rows = await bank_request_service.list_requests(db, user.family_id)
    return [BankRequestOut.model_validate(r) for r in rows]


@router.post("", response_model=BankRequestOut, status_code=status.HTTP_201_CREATED)
async def ask_for_bank(user: CurrentUser, db: DbSession, data: BankRequestIn) -> BankRequestOut:
    request = await bank_request_service.ask_for_bank(db, user.family_id, user.id, data)
    await db.commit()
    return BankRequestOut.model_validate(request)
