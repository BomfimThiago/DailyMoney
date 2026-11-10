from fastapi import APIRouter

from app.categories.schemas import CategoryOut
from app.categories.services import category_service
from app.core.deps import CurrentUser, DbSession

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(user: CurrentUser, db: DbSession) -> list[CategoryOut]:
    rows = await category_service.list_categories(db, user.family_id)
    return [CategoryOut.model_validate(c) for c in rows]
