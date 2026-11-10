import uuid

from pydantic import BaseModel, ConfigDict

from app.families.models import Currency


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    bank: str
    currency: Currency
    is_card: bool
    member_id: uuid.UUID | None
