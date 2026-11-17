import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Enum, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, UUIDPk
from app.families.models import Currency

# Status of a position: open ones count in the portfolio. GONE = the bank stopped
# reporting it (or the bank was disconnected); its history stays.
OPEN_STATUSES = ("ACTIVE", "PENDING")
GONE = "GONE"


class Investment(UUIDPk, CreatedAt, Base):
    """An investment as the bank reports it on its last read: these are balances, not
    transactions, so they never go through the import or the review."""

    __tablename__ = "investment"
    __table_args__ = (
        UniqueConstraint("family_id", "provider", "external_id", name="uq_investment_external"),
    )

    family_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("family.id", ondelete="CASCADE"), index=True
    )
    # Kept when the bank is disconnected: the position turns GONE, its history stays.
    connection_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("bank_connection.id", ondelete="SET NULL"), index=True
    )
    provider: Mapped[str] = mapped_column(String(20))
    external_id: Mapped[str] = mapped_column(String(200))
    bank: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(300))
    # Pluggy's own words: FIXED_INCOME, EQUITY, ETF, MUTUAL_FUND, SECURITY, ...
    type: Mapped[str] = mapped_column(String(40))
    subtype: Mapped[str | None] = mapped_column(String(60))
    issuer: Mapped[str | None] = mapped_column(String(200))
    code: Mapped[str | None] = mapped_column(String(60))
    currency: Mapped[Currency] = mapped_column(Enum(Currency, name="currency", create_type=False))
    # Net balance (tax and fees already taken), on value_date.
    balance: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    # How much was put in; only fixed income and Tesouro bring it.
    amount_original: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    # Agreed return: "rate" percent of "rate_type" (CDI, IPCA, ...) plus a fixed yearly rate.
    rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    rate_type: Mapped[str | None] = mapped_column(String(20))
    fixed_annual_rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20))
    value_date: Mapped[date] = mapped_column(Date)


class InvestmentSnapshot(UUIDPk, Base):
    """The balance of one investment on one day: the history behind the chart."""

    __tablename__ = "investment_snapshot"
    __table_args__ = (UniqueConstraint("investment_id", "date", name="uq_investment_snapshot"),)

    investment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("investment.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    balance: Mapped[Decimal] = mapped_column(Numeric(18, 4))
