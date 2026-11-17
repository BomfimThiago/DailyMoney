import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.families.models import Currency


class PositionOut(BaseModel):
    id: uuid.UUID
    bank: str
    name: str
    issuer: str | None
    code: str | None
    # Balance in the investment's own currency, as the bank reports it.
    currency: Currency
    balance: Decimal
    # The balance in the portfolio's currency.
    value: Decimal
    # Gain over what was put in, in the portfolio's currency; None when the bank doesn't
    # say how much was put in (shares, real estate funds, ETFs).
    gain: Decimal | None
    # "100% do CDI", "IPCA + 6,5% a.a."
    rate_label: str | None
    due_date: date | None
    value_date: date


class ClassOut(BaseModel):
    key: str
    label: str
    total: Decimal
    # Part of the portfolio, 0 to 1.
    share: Decimal
    positions: list[PositionOut]


class TrackedOut(BaseModel):
    """Only the positions whose amount put in is known."""

    invested: Decimal
    value: Decimal
    gain: Decimal
    gain_pct: Decimal | None


class BankTotal(BaseModel):
    bank: str
    total: Decimal


class MaturingOut(BaseModel):
    months: int
    count: int
    total: Decimal


class LadderStepOut(BaseModel):
    label: str
    year: int
    total: Decimal
    count: int


class LadderOut(BaseModel):
    steps: list[LadderStepOut]
    dated_total: Decimal
    dated_count: int
    undated_total: Decimal
    undated_count: int


class HistoryPoint(BaseModel):
    date: date
    total: Decimal


class PortfolioOut(BaseModel):
    """The investments of the connected banks, as the bank reported them on the last read."""

    currency: Currency
    total: Decimal
    count: int
    # The newest day a balance refers to; None with no open position.
    value_date: date | None
    # Withdrawn ones and ones the bank stopped reporting: only counted.
    closed: int
    # True when some bank that reports investments (Pluggy) is connected.
    has_source: bool
    tracked: TrackedOut | None
    classes: list[ClassOut]
    banks: list[BankTotal]
    maturing: MaturingOut
    ladder: LadderOut | None
    # The last 12 months.
    history: list[HistoryPoint]
