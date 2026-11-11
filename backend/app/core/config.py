from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def _split_csv(value: object) -> object:
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql+asyncpg://dailymoney:dailymoney@localhost:5432/dailymoney"

    SECRET_KEY: str = "dev-only-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 30

    # One OAuth client per platform (web, iOS, Android); a token from any of them is accepted.
    GOOGLE_CLIENT_IDS: Annotated[list[str], NoDecode] = []
    # Personal app: only these Google accounts may sign in. Empty means nobody (fail closed).
    ALLOWED_EMAILS: Annotated[list[str], NoDecode] = []

    # Public URL of the app; magic links point here.
    APP_URL: str = "http://localhost:8081"
    MAGIC_LINK_MINUTES: int = 15
    MAGIC_LINK_MAX_PER_WINDOW: int = 3

    # Empty key: links are only logged (development). Resend's free tier covers personal use.
    RESEND_API_KEY: str = ""
    SENDER_EMAIL: str = "Daily Money <onboarding@resend.dev>"

    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:8081"]

    # Enable Banking (Open Banking in Europe: Wise, Revolut, CaixaBank), restricted mode,
    # free for the owner's own accounts. The private key is the .pem the control panel
    # downloads when the application is registered: PEM text, or the PEM in base64.
    ENABLE_BANKING_APP_ID: str = ""
    ENABLE_BANKING_PRIVATE_KEY: str = ""
    ENABLE_BANKING_API_URL: str = "https://api.enablebanking.com"
    # Where the bank sends the person back; must be one of the app's Redirect URLs in
    # Enable Banking. Empty: APP_URL + /conexoes/retorno.
    ENABLE_BANKING_REDIRECT_URL: str = ""

    # Meu Pluggy (Open Finance in Brazil: Nubank, Inter), free for personal use. Items are
    # connected in Pluggy's own app; their ids go here, comma separated.
    PLUGGY_CLIENT_ID: str = ""
    PLUGGY_CLIENT_SECRET: str = ""
    PLUGGY_ITEM_IDS: Annotated[list[str], NoDecode] = []
    PLUGGY_API_URL: str = "https://api.pluggy.ai"

    @field_validator(
        "GOOGLE_CLIENT_IDS", "ALLOWED_EMAILS", "CORS_ORIGINS", "PLUGGY_ITEM_IDS", mode="before"
    )
    @classmethod
    def _csv(cls, value: object) -> object:
        return _split_csv(value)

    @field_validator("ALLOWED_EMAILS", mode="after")
    @classmethod
    def _lower(cls, value: list[str]) -> list[str]:
        return [email.lower() for email in value]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
