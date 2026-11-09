import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.families.models import Family, Member
from app.families.schemas import FamilyUpdate, MemberCreate, MemberUpdate

# Muted tones that sit well on the white UI; new members cycle through them.
MEMBER_PALETTE = ["#8a8799", "#c7795a", "#5f8f7b", "#6f7fb8", "#b88a3e", "#9b6fa8"]


async def get_family(db: AsyncSession, family_id: uuid.UUID) -> Family:
    family = await db.scalar(
        select(Family)
        .where(Family.id == family_id)
        .options(selectinload(Family.members))
        .execution_options(populate_existing=True)
    )
    if family is None:
        raise NotFoundError("Família não encontrada")
    return family


async def update_family(db: AsyncSession, family_id: uuid.UUID, data: FamilyUpdate) -> Family:
    family = await get_family(db, family_id)
    for field, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(family, field, value)
    await db.flush()
    return family


async def add_member(db: AsyncSession, family_id: uuid.UUID, data: MemberCreate) -> Member:
    family = await get_family(db, family_id)
    color = data.color or MEMBER_PALETTE[len(family.members) % len(MEMBER_PALETTE)]
    member = Member(family_id=family_id, name=data.name.strip(), color=color)
    db.add(member)
    await _flush_unique_name(db)
    return member


async def update_member(
    db: AsyncSession, family_id: uuid.UUID, member_id: uuid.UUID, data: MemberUpdate
) -> Member:
    member = await _get_member(db, family_id, member_id)
    if data.name is not None:
        member.name = data.name.strip()
    if data.color is not None:
        member.color = data.color
    await _flush_unique_name(db)
    return member


async def delete_member(db: AsyncSession, family_id: uuid.UUID, member_id: uuid.UUID) -> None:
    member = await _get_member(db, family_id, member_id)
    if member.user_id is not None:
        raise ConflictError("Quem tem login não pode ser removido da família")
    await db.delete(member)
    await db.flush()


async def _get_member(db: AsyncSession, family_id: uuid.UUID, member_id: uuid.UUID) -> Member:
    member = await db.get(Member, member_id)
    # Same 404 for "missing" and "other family" so ids from other families leak nothing.
    if member is None or member.family_id != family_id:
        raise NotFoundError("Membro não encontrado")
    return member


async def _flush_unique_name(db: AsyncSession) -> None:
    try:
        async with db.begin_nested():
            await db.flush()
    except IntegrityError as exc:
        raise ConflictError("Já existe um membro com esse nome") from exc
