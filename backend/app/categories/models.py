import enum
import uuid

from sqlalchemy import Enum, ForeignKey, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, UUIDPk


class CategoryKind(enum.StrEnum):
    EXPENSE = "expense"
    INCOME = "income"
    # Money only changing place; counts neither as spending nor as income.
    TRANSFER = "transfer"


class Category(UUIDPk, CreatedAt, Base):
    __tablename__ = "category"
    __table_args__ = (UniqueConstraint("family_id", "name", name="uq_category_family_name"),)

    family_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("family.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(60))
    kind: Mapped[CategoryKind] = mapped_column(
        Enum(CategoryKind, name="category_kind", values_callable=lambda e: [m.value for m in e])
    )
    color: Mapped[str] = mapped_column(String(7))
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0)


class CategoryRule(UUIDPk, CreatedAt, Base):
    """'Next ones from this merchant go to this category', learned from a manual change."""

    __tablename__ = "category_rule"
    __table_args__ = (
        UniqueConstraint("family_id", "merchant_key", name="uq_rule_family_merchant"),
    )

    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("family.id", ondelete="CASCADE"))
    merchant_key: Mapped[str] = mapped_column(String(120))
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("category.id", ondelete="CASCADE"))
