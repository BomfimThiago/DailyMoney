"""Reading one row of the logged-in family, by id."""

import uuid
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError


class FamilyOwned(Protocol):
    @property
    def family_id(self) -> uuid.UUID: ...


async def get_in_family[T: FamilyOwned](
    db: AsyncSession, model: type[T], family_id: uuid.UUID, row_id: uuid.UUID, not_found: str
) -> T:
    row = await db.get(model, row_id)
    # Same 404 for "missing" and "other family" so ids from other families leak nothing.
    if row is None or row.family_id != family_id:
        raise NotFoundError(not_found)
    return row
