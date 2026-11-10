import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.families.models import Currency


class TransactionOut(BaseModel):
    id: uuid.UUID
    date: date
    description: str
    amount: Decimal
    currency: Currency
    is_transfer: bool
    account_id: uuid.UUID
    account_name: str
    category_id: uuid.UUID | None
    category_name: str | None
    member_id: uuid.UUID | None


class TransactionPage(BaseModel):
    total: int
    items: list[TransactionOut]


class TransactionUpdate(BaseModel):
    category_id: uuid.UUID
    # "Valer para as próximas deste estabelecimento" (spec: Trocar a categoria).
    apply_to_merchant: bool = False
