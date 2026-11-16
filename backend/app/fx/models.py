import datetime as dt
from decimal import Decimal

from sqlalchemy import Date, Enum, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.families.models import Currency


class FxRate(Base):
    """European Central Bank reference rate, one row per calendar day and currency.

    The ECB publishes on business days only; weekends and holidays get a row carrying the
    last published rate (``rate_date``), so a stretch of days is complete when it has one
    row per day. The euro is the base and has no row.
    """

    __tablename__ = "fx_rate"

    date: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    currency: Mapped[Currency] = mapped_column(
        Enum(Currency, name="currency", create_type=False), primary_key=True
    )
    # How much of `currency` one euro buys.
    per_eur: Mapped[Decimal] = mapped_column(Numeric(18, 8))
    rate_date: Mapped[dt.date] = mapped_column(Date)
