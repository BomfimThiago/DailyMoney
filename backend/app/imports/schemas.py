import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.families.models import Currency
from app.imports.models import ImportStatus

RowStatus = Literal["new", "duplicate", "transfer", "skipped"]


class PreviewRow(BaseModel):
    index: int
    date: date
    description: str
    amount: Decimal
    currency: Currency
    category: str | None
    status: RowStatus


class RowErrorOut(BaseModel):
    row: int
    message: str


class AccountRef(BaseModel):
    id: uuid.UUID
    name: str


class GroupCounts(BaseModel):
    new: int = 0
    duplicate: int = 0
    transfer: int = 0
    skipped: int = 0


class PreviewGroup(BaseModel):
    currency: Currency
    # Account the rows go to: the one chosen, or an existing one from the same bank.
    account: AccountRef | None
    suggested_name: str
    # No transactions in the account yet: the person picks from which date to import.
    first_import: bool
    counts: GroupCounts


class ImportPreview(BaseModel):
    id: uuid.UUID
    filename: str
    format: str
    bank: str | None
    is_card: bool
    status: ImportStatus
    period_start: date | None
    period_end: date | None
    # Every row failed because the file doesn't say its currency: ask for it and resend.
    needs_currency: bool
    groups: list[PreviewGroup]
    rows: list[PreviewRow]
    errors: list[RowErrorOut]


class PreviewRequest(BaseModel):
    accounts: dict[Currency, uuid.UUID | None] = Field(default_factory=dict)
    since: date | None = None


class NewAccount(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    member_id: uuid.UUID | None = None


class AccountChoice(BaseModel):
    currency: Currency
    account_id: uuid.UUID | None = None
    new_account: NewAccount | None = None

    @model_validator(mode="after")
    def one_of(self) -> "AccountChoice":
        if (self.account_id is None) == (self.new_account is None):
            raise ValueError("Escolha uma conta existente ou crie uma nova")
        return self


class ConfirmRequest(BaseModel):
    accounts: list[AccountChoice] = Field(min_length=1)
    since: date | None = None


class ImportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    format: str
    bank: str | None
    status: ImportStatus
    period_start: date | None
    period_end: date | None
    imported_count: int
    duplicate_count: int
    transfer_count: int
    skipped_count: int
    created_at: datetime
    finished_at: datetime | None
