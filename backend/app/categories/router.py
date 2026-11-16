import uuid

from fastapi import APIRouter, status

from app.categories.schemas import CategoryCreate, CategoryOut, CategoryUpdate, RuleOut
from app.categories.services import category_service
from app.core.deps import CurrentUser, DbSession

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(user: CurrentUser, db: DbSession) -> list[CategoryOut]:
    return await category_service.overview(db, user.family_id)


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(data: CategoryCreate, user: CurrentUser, db: DbSession) -> CategoryOut:
    category = await category_service.create(db, user.family_id, data)
    await db.commit()
    return category


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: uuid.UUID, data: CategoryUpdate, user: CurrentUser, db: DbSession
) -> CategoryOut:
    category = await category_service.update(db, user.family_id, category_id, data)
    await db.commit()
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    await category_service.delete(db, user.family_id, category_id)
    await db.commit()


@router.get("/{category_id}/rules", response_model=list[RuleOut])
async def category_rules(category_id: uuid.UUID, user: CurrentUser, db: DbSession) -> list[RuleOut]:
    return await category_service.rules_of(db, user.family_id, category_id)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    await category_service.delete_rule(db, user.family_id, rule_id)
    await db.commit()
