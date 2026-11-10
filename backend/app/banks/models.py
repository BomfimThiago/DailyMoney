import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAt, UUIDPk


class BankRequest(UUIDPk, CreatedAt, Base):
    """A bank someone asked the app to support (Enviar extrato > Bancos suportados)."""

    __tablename__ = "bank_request"

    family_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("family.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("app_user.id", ondelete="SET NULL")
    )
    bank_name: Mapped[str] = mapped_column(String(80))
    note: Mapped[str | None] = mapped_column(String(300))
