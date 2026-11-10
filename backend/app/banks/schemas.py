import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

BankName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]


class BankRequestIn(BaseModel):
    bank_name: BankName
    note: Note | None = None


class BankRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    bank_name: str
    note: str | None
    created_at: datetime
