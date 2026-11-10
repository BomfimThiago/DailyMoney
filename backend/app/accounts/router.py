from fastapi import APIRouter

from app.accounts.schemas import AccountOut
from app.accounts.services import account_service
from app.core.deps import CurrentUser, DbSession

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
async def list_accounts(user: CurrentUser, db: DbSession) -> list[AccountOut]:
    rows = await account_service.list_accounts(db, user.family_id)
    return [AccountOut.model_validate(a) for a in rows]
