import enum
import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, UUIDPk


class ImportStatus(enum.StrEnum):
    PREVIEW = "preview"
    IMPORTED = "imported"
    CANCELLED = "cancelled"


class StatementImport(UUIDPk, CreatedAt, Base):
    """One uploaded statement. The file itself is never stored: only the rows read from it,
    and those only until the import is confirmed or cancelled."""

    __tablename__ = "statement_import"

    family_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("family.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("app_user.id", ondelete="SET NULL")
    )
    filename: Mapped[str] = mapped_column(String(255))
    format: Mapped[str] = mapped_column(String(10))
    bank: Mapped[str | None] = mapped_column(String(80))
    is_card: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[ImportStatus] = mapped_column(
        Enum(ImportStatus, name="import_status", values_callable=lambda e: [m.value for m in e]),
        default=ImportStatus.PREVIEW,
    )
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    rows: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    errors: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    imported_count: Mapped[int] = mapped_column(Integer, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, default=0)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
