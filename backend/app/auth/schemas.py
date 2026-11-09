from pydantic import BaseModel, Field


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(min_length=10)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=10)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
