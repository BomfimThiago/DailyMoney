import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, CreatedAt, UUIDPk


class Currency(enum.StrEnum):
    BRL = "BRL"
    USD = "USD"
    EUR = "EUR"


class Family(UUIDPk, CreatedAt, Base):
    __tablename__ = "family"

    name: Mapped[str] = mapped_column(String(120))
    display_currency: Mapped[Currency] = mapped_column(
        Enum(Currency, name="currency"), default=Currency.BRL
    )
    month_start_day: Mapped[int] = mapped_column(SmallInteger, default=1)

    users: Mapped[list["User"]] = relationship(back_populates="family")
    members: Mapped[list["Member"]] = relationship(
        back_populates="family", order_by="Member.created_at"
    )


class User(UUIDPk, CreatedAt, Base):
    __tablename__ = "app_user"

    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("family.id", ondelete="CASCADE"))
    email: Mapped[str] = mapped_column(String(320), unique=True)
    google_sub: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    picture_url: Mapped[str | None] = mapped_column(String(1000))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    family: Mapped[Family] = relationship(back_populates="users")


class Member(UUIDPk, CreatedAt, Base):
    __tablename__ = "member"
    __table_args__ = (UniqueConstraint("family_id", "name", name="uq_member_family_name"),)

    family_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("family.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    color: Mapped[str] = mapped_column(String(7), default="#8a8799")
    # A member may exist only as a label on transactions, without a login of their own.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("app_user.id", ondelete="SET NULL"), unique=True
    )

    family: Mapped[Family] = relationship(back_populates="members")
