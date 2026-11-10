import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, UUIDPk


class BankConnection(UUIDPk, CreatedAt, Base):
    """A bank the family authorized the app to read (Enable Banking or Pluggy)."""

    __tablename__ = "bank_connection"
    __table_args__ = (
        UniqueConstraint("family_id", "provider", "bank", name="uq_bank_connection_bank"),
    )

    family_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("family.id", ondelete="CASCADE"), index=True
    )
    # Who connected it: new accounts from this bank belong to them.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("app_user.id", ondelete="SET NULL")
    )
    # "enablebanking" or "pluggy".
    provider: Mapped[str] = mapped_column(String(20))
    # Enable Banking session id, or Pluggy item id.
    external_id: Mapped[str] = mapped_column(String(200))
    bank: Mapped[str] = mapped_column(String(80))
    # Enable Banking needs the bank's name and country to authorize it again.
    aspsp_name: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(2))
    # The accounts the bank shares: see services/sync_service.StoredAccount.
    accounts: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    # Nothing before this day is read.
    sync_from: Mapped[date] = mapped_column(Date)
    consent_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(1000))
