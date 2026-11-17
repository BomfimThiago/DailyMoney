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


class AccountUpdate(BaseModel):
    # Who the account belongs to; null means the whole household.
    member_id: uuid.UUID | None
