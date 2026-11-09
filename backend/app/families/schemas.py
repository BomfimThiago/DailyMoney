import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.families.models import Currency

HEX_COLOR = r"^#[0-9a-fA-F]{6}$"


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    color: str
    user_id: uuid.UUID | None


class FamilyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    display_currency: Currency
    month_start_day: int
    members: list[MemberOut]


class FamilyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    display_currency: Currency | None = None
    month_start_day: int | None = Field(default=None, ge=1, le=28)


class MemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str | None = Field(default=None, pattern=HEX_COLOR)


class MemberUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, pattern=HEX_COLOR)


class MeOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    picture_url: str | None
    family: FamilyOut
