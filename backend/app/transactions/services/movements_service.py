"""Conferência das movimentações (Transações > Transferências).

The money that only changed place in the month (between the family's own accounts, card
bill payments, currency exchange): it counts neither as spending nor as income. By
category, how much left and how much arrived. With every account in the app, what leaves
one arrives in another, so the total closes near zero; what didn't come back went to an
account the app doesn't read yet (or came from one).
"""

import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.categories.models import Category
from app.families.models import Currency
from app.families.services.family_service import month_start_day
from app.fx.services.fx_service import converter
from app.transactions.models import APPROVED, Transaction, TxKind
from app.transactions.schemas import MovementGroup, MovementRow, MovementsOverview
from app.transactions.services.months import month_range

ZERO = Decimal("0")
# Up to 1% of what moved still "closes": fees, exchange spread, rounding.
TOLERANCE = Decimal("0.01")


async def movements(
    db: AsyncSession, family_id: uuid.UUID, month: str, currency: Currency | None = None
) -> MovementsOverview:
    lo, hi = month_range(month, await month_start_day(db, family_id))
    conv = await converter(db, currency, lo, hi)
    rows = await db.execute(
        select(
            Transaction.currency,
            Transaction.amount,
            Transaction.date,
            Category.name,
            Category.color,
        )
        .outerjoin(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.family_id == family_id,
            APPROVED,
            Transaction.kind == TxKind.TRANSFER,
            Transaction.date.between(lo, hi),
        )
    )
    # (currency shown, category) -> [left, arrived, count]
    sums: dict[Currency, dict[tuple[str | None, str | None], list[Decimal]]] = defaultdict(
        lambda: defaultdict(lambda: [ZERO, ZERO, ZERO])
    )
    for original, raw, day, name, color in rows:
        amount = conv(raw, original, day)
        s = sums[conv.currency(original)][(name, color)]
        s[0 if amount < 0 else 1] += abs(amount)
        s[2] += 1
    return MovementsOverview(
        month=month,
        groups=[_group(c, sums[c]) for c in sorted(sums, key=lambda c: c.value)],
    )


def _group(
    currency: Currency, by_category: dict[tuple[str | None, str | None], list[Decimal]]
) -> MovementGroup:
    rows = [
        MovementRow(
            name=name,
            color=color,
            went_out=s[0],
            came_in=s[1],
            net=s[1] - s[0],
            count=int(s[2]),
        )
        for (name, color), s in by_category.items()
    ]
    rows.sort(key=lambda r: (-(r.went_out + r.came_in), r.name or ""))
    went_out = sum((r.went_out for r in rows), ZERO)
    came_in = sum((r.came_in for r in rows), ZERO)
    net = came_in - went_out
    if abs(net) <= (went_out + came_in) * TOLERANCE:
        result = "closed"
    else:
        result = "out" if net < 0 else "in"
    return MovementGroup(
        currency=currency,
        rows=rows,
        went_out=went_out,
        came_in=came_in,
        net=net,
        result=result,
    )
