from datetime import UTC, datetime, timedelta

from app.auth.models import RefreshToken
from app.auth.services.auth_service import REFRESH_REUSE_SECONDS, _traded_in_long_ago

NOW = datetime(2026, 11, 16, 5, 0, tzinfo=UTC)


def _token(revoked_seconds_ago: int | None) -> RefreshToken:
    revoked = None if revoked_seconds_ago is None else NOW - timedelta(seconds=revoked_seconds_ago)
    return RefreshToken(revoked_at=revoked, expires_at=NOW + timedelta(days=30))


def test_a_token_never_traded_in_is_good() -> None:
    assert _traded_in_long_ago(_token(None), NOW) is False


def test_a_token_just_traded_in_still_works_for_a_moment() -> None:
    assert _traded_in_long_ago(_token(REFRESH_REUSE_SECONDS - 1), NOW) is False


def test_a_token_traded_in_a_minute_ago_is_refused() -> None:
    assert _traded_in_long_ago(_token(REFRESH_REUSE_SECONDS), NOW) is True
