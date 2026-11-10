import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, UUIDPk
from app.families.models import Currency


class Account(UUIDPk, CreatedAt, Base):
    """A bank account or card, always in one currency (Wise has one per currency)."""

    __tablename__ = "account"
    __table_args__ = (UniqueConstraint("family_id", "name", name="uq_account_family_name"),)

    family_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("family.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    bank: Mapped[str] = mapped_column(String(80))
    currency: Mapped[Currency] = mapped_column(Enum(Currency, name="currency", create_type=False))
    is_card: Mapped[bool] = mapped_column(Boolean, default=False)
    # Owner of the account; empty means it belongs to the household ("Casa").
    member_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("member.id", ondelete="SET NULL")
    )
