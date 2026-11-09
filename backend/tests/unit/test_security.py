import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import settings
from app.core.exceptions import UnauthorizedError
from app.core.security import create_access_token, decode_access_token, hash_token


def test_access_token_roundtrip() -> None:
    user_id = uuid.uuid4()
    assert decode_access_token(create_access_token(user_id)) == user_id


def test_expired_access_token_rejected() -> None:
    old = datetime.now(UTC) - timedelta(hours=2)
    token = create_access_token(uuid.uuid4(), now=old)
    with pytest.raises(UnauthorizedError):
        decode_access_token(token)


def test_token_with_wrong_type_rejected() -> None:
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "type": "refresh",
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    with pytest.raises(UnauthorizedError):
        decode_access_token(token)


def test_token_signed_with_other_key_rejected() -> None:
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access", "exp": datetime.now(UTC) + timedelta(hours=1)},
        "another-secret-key-that-is-long-enough",
        algorithm="HS256",
    )
    with pytest.raises(UnauthorizedError):
        decode_access_token(token)


def test_hash_token_is_stable_and_not_the_raw_value() -> None:
    assert hash_token("abc") == hash_token("abc")
    assert hash_token("abc") != "abc"
    assert len(hash_token("abc")) == 64
