from typing import Any

import pytest

from app.auth.services.google import identity_from_claims
from app.core.exceptions import UnauthorizedError

AUDIENCES = ["web-client", "ios-client"]


def claims(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "iss": "https://accounts.google.com",
        "aud": "ios-client",
        "sub": "123",
        "email": "Thiago@Example.com",
        "email_verified": True,
        "name": "Thiago Bomfim",
        "picture": "https://example.com/p.png",
    }
    base.update(overrides)
    return base


def test_valid_claims_from_any_platform_client() -> None:
    identity = identity_from_claims(claims(), AUDIENCES)
    assert identity.sub == "123"
    assert identity.email == "thiago@example.com"
    assert identity.name == "Thiago Bomfim"


@pytest.mark.parametrize(
    "bad",
    [
        {"aud": "someone-elses-client"},
        {"iss": "https://evil.example.com"},
        {"email_verified": False},
        {"email": ""},
        {"sub": ""},
    ],
)
def test_invalid_claims_rejected(bad: dict[str, Any]) -> None:
    with pytest.raises(UnauthorizedError):
        identity_from_claims(claims(**bad), AUDIENCES)


def test_no_configured_client_rejects_everything() -> None:
    with pytest.raises(UnauthorizedError):
        identity_from_claims(claims(), [])


def test_missing_name_falls_back_to_email_prefix() -> None:
    assert identity_from_claims(claims(name=None), AUDIENCES).name == "thiago"


async def test_verify_google_id_token_checks_signature_then_claims(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.auth.services import google

    monkeypatch.setattr("google.oauth2.id_token.verify_oauth2_token", lambda *a, **k: claims())
    monkeypatch.setattr("app.core.config.settings.GOOGLE_CLIENT_IDS", AUDIENCES)
    identity = await google.verify_google_id_token("signed-token")
    assert identity.email == "thiago@example.com"
    assert google.get_google_verifier() is google.verify_google_id_token


async def test_verify_google_id_token_bad_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.auth.services import google

    def boom(*_: Any, **__: Any) -> dict[str, Any]:
        raise ValueError("Token used too late")

    monkeypatch.setattr("google.oauth2.id_token.verify_oauth2_token", boom)
    with pytest.raises(UnauthorizedError):
        await google.verify_google_id_token("signed-token")
