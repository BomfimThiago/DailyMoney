import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.families.models import Currency


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    bank: str
    currency: Currency
    is_card: bool
    member_id: uuid.UUID | None
    bill_close_day: int | None = None
    bill_due_day: int | None = None


class AccountUpdate(BaseModel):
    """Only the fields sent change; null is a real value for each of them."""

    # Who the account belongs to; null means the whole household.
    member_id: uuid.UUID | None = None
    # Cards only: the day the bill closes and the day it is due.
    bill_close_day: int | None = Field(default=None, ge=1, le=31)
    bill_due_day: int | None = Field(default=None, ge=1, le=31)
