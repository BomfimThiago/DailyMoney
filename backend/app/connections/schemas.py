import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class ConnectedAccount(BaseModel):
    # The family's account its lines go to; empty until the first read.
    account_id: uuid.UUID | None
    name: str
    currency: str | None
    is_card: bool


class ConnectionOut(BaseModel):
    id: uuid.UUID
    provider: Literal["enablebanking", "pluggy"]
    bank: str
    accounts: list[ConnectedAccount]
    consent_expires_at: datetime | None
    last_sync_at: datetime | None
    last_error: str | None


class ConnectionsOverview(BaseModel):
    connections: list[ConnectionOut]
    # Banks that can be connected from the app (Enable Banking), when it is set up.
    european_banks: list[str]
    # Brazilian banks are connected in Meu Pluggy's own app.
    brazil_ready: bool


class StartIn(BaseModel):
    bank: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class StartOut(BaseModel):
    url: str


class FinishIn(BaseModel):
    code: Text
    state: Text


class AccountSyncOut(BaseModel):
    name: str
    new: int
    duplicate: int
    error: str | None


class SyncOut(BaseModel):
    connection: ConnectionOut
    accounts: list[AccountSyncOut]
