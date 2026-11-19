import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.categories.models import Category, CategoryKind, CategoryRule
from app.categories.schemas import CategoryCreate, CategoryOut, CategoryUpdate, RuleOut
from app.categories.services.categorize import CARD_PAYMENT, DEFAULT_CATEGORIES, Categorizer
from app.core.exceptions import ConflictError, NotFoundError
from app.transactions.models import Transaction

DUPLICATE = "Já existe uma categoria com esse nome."
CARD_PAYMENT_KIND = (
    "Pagar a fatura não é um gasto novo: as compras do cartão já contaram no dia em que "
    "foram feitas. Por isso essa categoria não muda de tipo."
)


def seed_defaults(db: AsyncSession, family_id: uuid.UUID) -> None:
    for order, (name, kind, color) in enumerate(DEFAULT_CATEGORIES):
        db.add(
            Category(
                family_id=family_id,
                name=name,
                kind=CategoryKind(kind),
                color=color,
                sort_order=order,
                system_key=name,
            )
        )


async def list_categories(db: AsyncSession, family_id: uuid.UUID) -> list[Category]:
    rows = await db.scalars(
        select(Category)
        .where(Category.family_id == family_id)
        .order_by(Category.sort_order, Category.name)
    )
    return list(rows)


async def overview(db: AsyncSession, family_id: uuid.UUID) -> list[CategoryOut]:
    """Every category with how many lines and learned merchants it has."""
    lines = dict(
        (
            await db.execute(
                select(Transaction.category_id, func.count())
                .where(Transaction.family_id == family_id)
                .group_by(Transaction.category_id)
            )
        ).all()
    )
    rules = dict(
        (
            await db.execute(
                select(CategoryRule.category_id, func.count())
                .where(CategoryRule.family_id == family_id)
                .group_by(CategoryRule.category_id)
            )
        ).all()
    )
    return [
        _out(c, lines.get(c.id, 0), rules.get(c.id, 0))
        for c in await list_categories(db, family_id)
    ]


def _out(c: Category, lines: int = 0, rules: int = 0) -> CategoryOut:
    return CategoryOut(
        id=c.id,
        name=c.name,
        kind=c.kind,
        color=c.color,
        is_default=c.system_key is not None,
        key=c.system_key,
        transaction_count=lines,
        rule_count=rules,
    )


async def create(db: AsyncSession, family_id: uuid.UUID, data: CategoryCreate) -> CategoryOut:
    await _refuse_repeated(db, family_id, data.name)
    last = await db.scalar(
        select(func.max(Category.sort_order)).where(Category.family_id == family_id)
    )
    category = Category(
        family_id=family_id,
        name=data.name,
        kind=data.kind,
        color=data.color,
        sort_order=(last or 0) + 1,
    )
    db.add(category)
    await _flush(db)
    return _out(category)


async def update(
    db: AsyncSession, family_id: uuid.UUID, category_id: uuid.UUID, data: CategoryUpdate
) -> CategoryOut:
    category = await _get(db, family_id, category_id)
    if data.name is not None and data.name != category.name:
        await _refuse_repeated(db, family_id, data.name, besides=category.id)
        category.name = data.name
    if data.color is not None:
        category.color = data.color
    if data.kind is not None and data.kind != category.kind:
        if category.system_key == CARD_PAYMENT:
            raise ConflictError(CARD_PAYMENT_KIND)
        await _set_kind(db, category, data.kind)
    await _flush(db)
    return next(c for c in await overview(db, family_id) if c.id == category.id)


async def _set_kind(db: AsyncSession, category: Category, kind: CategoryKind) -> None:
    # Imported here: the transactions service already depends on this module.
    from app.transactions.services.transaction_service import follow_category

    category.kind = kind
    lines = list(
        await db.scalars(
            select(Transaction).where(
                Transaction.family_id == category.family_id,
                Transaction.category_id == category.id,
            )
        )
    )
    for tx in lines:
        await follow_category(db, tx, category)


async def delete(db: AsyncSession, family_id: uuid.UUID, category_id: uuid.UUID) -> None:
    """Its lines stay, without a category; the merchants learned for it are forgotten."""
    await db.delete(await _get(db, family_id, category_id))
    await db.flush()


async def rules_of(db: AsyncSession, family_id: uuid.UUID, category_id: uuid.UUID) -> list[RuleOut]:
    await _get(db, family_id, category_id)
    rows = await db.scalars(
        select(CategoryRule)
        .where(CategoryRule.family_id == family_id, CategoryRule.category_id == category_id)
        .order_by(CategoryRule.merchant_key)
    )
    return [RuleOut(id=r.id, merchant=r.merchant_key) for r in rows]


async def delete_rule(db: AsyncSession, family_id: uuid.UUID, rule_id: uuid.UUID) -> None:
    rule = await db.get(CategoryRule, rule_id)
    if rule is None or rule.family_id != family_id:
        raise NotFoundError("Regra não encontrada")
    await db.delete(rule)
    await db.flush()


async def _get(db: AsyncSession, family_id: uuid.UUID, category_id: uuid.UUID) -> Category:
    category = await db.get(Category, category_id)
    if category is None or category.family_id != family_id:
        raise NotFoundError("Categoria não encontrada")
    return category


async def _refuse_repeated(
    db: AsyncSession, family_id: uuid.UUID, name: str, besides: uuid.UUID | None = None
) -> None:
    query = select(Category.id).where(
        Category.family_id == family_id, func.lower(Category.name) == name.lower()
    )
    if besides is not None:
        query = query.where(Category.id != besides)
    if await db.scalar(query) is not None:
        raise ConflictError(DUPLICATE)


async def _flush(db: AsyncSession) -> None:
    try:
        await db.flush()
    except IntegrityError as exc:  # two people saving the same name at once
        raise ConflictError(DUPLICATE) from exc


async def categories_by_name(db: AsyncSession, family_id: uuid.UUID) -> dict[str, Category]:
    """Categories by their default key and by their current name.

    Suggestions use the default names ("Mercado"); learned rules use the current one.
    A current name wins over a key, so a new "Mercado" takes over from a renamed one.
    """
    categories = await list_categories(db, family_id)
    found = {c.system_key: c for c in categories if c.system_key}
    found.update({c.name: c for c in categories})
    return found


async def categorizer_for(db: AsyncSession, family_id: uuid.UUID) -> Categorizer:
    rows = await db.execute(
        select(CategoryRule.merchant_key, Category.name)
        .join(Category, Category.id == CategoryRule.category_id)
        .where(CategoryRule.family_id == family_id)
    )
    return Categorizer(rules={key: name for key, name in rows})
