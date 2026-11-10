import enum
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Date,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, UUIDPk
from app.families.models import Currency


class TxKind(enum.StrEnum):
    # Spending (negative) or income (positive).
    REGULAR = "regular"
    # Money put into or taken out of an investment: neither spending nor income.
    INVESTMENT = "investment"
    # Money moving between the family's own accounts.
    TRANSFER = "transfer"
    # Looks like a transfer to the family's own account, but the other side wasn't found:
    # stays out of spending and income until the person says what it was.
    PENDING = "pending"


class Transaction(UUIDPk, CreatedAt, Base):
    __tablename__ = "transaction"
    __table_args__ = (
        # Re-importing the same statement line can never create a second row.
        UniqueConstraint("account_id", "source_key", name="uq_transaction_account_source"),
        Index("ix_transaction_family_date", "family_id", "date"),
        Index("ix_transaction_account_date", "account_id", "date"),
    )

    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("family.id", ondelete="CASCADE"))
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("account.id", ondelete="CASCADE"))
    member_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("member.id", ondelete="SET NULL")
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("category.id", ondelete="SET NULL")
    )
    import_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("statement_import.id", ondelete="SET NULL"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(String(500))
    # Signed and in the account's own currency: negative is money leaving.
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    currency: Mapped[Currency] = mapped_column(Enum(Currency, name="currency", create_type=False))
    external_id: Mapped[str | None] = mapped_column(String(200))
    source_key: Mapped[str | None] = mapped_column(String(64))
    source_format: Mapped[str] = mapped_column(String(10))
    kind: Mapped[TxKind] = mapped_column(
        Enum(TxKind, name="tx_kind", values_callable=lambda e: [m.value for m in e]),
        default=TxKind.REGULAR,
    )
    transfer_pair_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transaction.id", ondelete="SET NULL")
    )
