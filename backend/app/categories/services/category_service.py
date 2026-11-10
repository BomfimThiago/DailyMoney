import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.categories.models import Category, CategoryKind, CategoryRule
from app.categories.services.categorize import DEFAULT_CATEGORIES, Categorizer


def seed_defaults(db: AsyncSession, family_id: uuid.UUID) -> None:
    for order, (name, kind, color) in enumerate(DEFAULT_CATEGORIES):
        db.add(
            Category(
                family_id=family_id,
                name=name,
                kind=CategoryKind(kind),
                color=color,
                sort_order=order,
            )
        )


async def list_categories(db: AsyncSession, family_id: uuid.UUID) -> list[Category]:
    rows = await db.scalars(
        select(Category)
        .where(Category.family_id == family_id)
        .order_by(Category.sort_order, Category.name)
    )
    return list(rows)


async def categories_by_name(db: AsyncSession, family_id: uuid.UUID) -> dict[str, Category]:
    return {c.name: c for c in await list_categories(db, family_id)}


async def categorizer_for(db: AsyncSession, family_id: uuid.UUID) -> Categorizer:
    rows = await db.execute(
        select(CategoryRule.merchant_key, Category.name)
        .join(Category, Category.id == CategoryRule.category_id)
        .where(CategoryRule.family_id == family_id)
    )
    return Categorizer(rules={key: name for key, name in rows})
