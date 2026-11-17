from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.families.models import Currency
from app.portfolio.schemas import PortfolioOut
from app.portfolio.services import portfolio_service

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioOut)
async def portfolio(
    user: CurrentUser, db: DbSession, currency: Annotated[Currency | None, Query()] = None
) -> PortfolioOut:
    """The investments of the connected banks, in one currency (the family's by default)."""
    result = await portfolio_service.portfolio(db, user.family_id, currency, date.today())
    await db.commit()
    return result
