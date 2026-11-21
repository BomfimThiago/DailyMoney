import uuid

from fastapi import APIRouter

from app.accounts.schemas import AccountOut, AccountUpdate
from app.accounts.services import account_service
from app.core.deps import CurrentUser, DbSession

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
async def list_accounts(user: CurrentUser, db: DbSession) -> list[AccountOut]:
    rows = await account_service.list_accounts(db, user.family_id)
    return [AccountOut.model_validate(a) for a in rows]


@router.patch("/{account_id}", response_model=AccountOut)
async def update_account(
    account_id: uuid.UUID, data: AccountUpdate, user: CurrentUser, db: DbSession
) -> AccountOut:
    account = await account_service.get_account(db, user.family_id, account_id)
    sent = data.model_fields_set
    if "member_id" in sent:
        account = await account_service.set_owner(db, user.family_id, account_id, data.member_id)
    if sent & {"bill_close_day", "bill_due_day"}:
        account = await account_service.set_bill_days(
            db,
            user.family_id,
            account_id,
            data.bill_close_day if "bill_close_day" in sent else account.bill_close_day,
            data.bill_due_day if "bill_due_day" in sent else account.bill_due_day,
        )
    await db.commit()
    return AccountOut.model_validate(account)
