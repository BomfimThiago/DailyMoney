import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.categories.models import CategoryKind

HEX_COLOR = r"^#[0-9a-fA-F]{6}$"
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Color = Annotated[str, StringConstraints(to_lower=True, pattern=HEX_COLOR)]


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: CategoryKind
    color: str
    # Seeded with the family; the app's suggestions land in it.
    is_default: bool = False
    transaction_count: int = 0
    # Merchants the app learned to send to this category.
    rule_count: int = 0


class CategoryCreate(BaseModel):
    name: Name
    kind: CategoryKind
    color: Color


class CategoryUpdate(BaseModel):
    name: Name | None = None
    color: Color | None = None
    # Gasto, entrada or movimentação. Also applies to the lines already in it:
    # movimentação takes them out of every total, gasto/entrada brings them back.
    kind: CategoryKind | None = None


class RuleOut(BaseModel):
    id: uuid.UUID
    # The merchant as the app matches it ("grupo ahorramas").
    merchant: str = Field(examples=["grupo ahorramas"])
