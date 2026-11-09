import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, DbSession
from app.families.schemas import FamilyOut, FamilyUpdate, MemberCreate, MemberOut, MemberUpdate
from app.families.services import family_service

router = APIRouter(prefix="/family", tags=["family"])


@router.get("", response_model=FamilyOut)
async def get_family(user: CurrentUser, db: DbSession) -> FamilyOut:
    family = await family_service.get_family(db, user.family_id)
    return FamilyOut.model_validate(family)


@router.patch("", response_model=FamilyOut)
async def update_family(data: FamilyUpdate, user: CurrentUser, db: DbSession) -> FamilyOut:
    await family_service.update_family(db, user.family_id, data)
    await db.commit()
    return FamilyOut.model_validate(await family_service.get_family(db, user.family_id))


@router.post("/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def add_member(data: MemberCreate, user: CurrentUser, db: DbSession) -> MemberOut:
    member = await family_service.add_member(db, user.family_id, data)
    await db.commit()
    return MemberOut.model_validate(member)


@router.patch("/members/{member_id}", response_model=MemberOut)
async def update_member(
    member_id: uuid.UUID, data: MemberUpdate, user: CurrentUser, db: DbSession
) -> MemberOut:
    member = await family_service.update_member(db, user.family_id, member_id, data)
    await db.commit()
    return MemberOut.model_validate(member)


@router.delete("/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member(member_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    await family_service.delete_member(db, user.family_id, member_id)
    await db.commit()
