import uuid

from pydantic import BaseModel, ConfigDict

from app.categories.models import CategoryKind


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: CategoryKind
    color: str
