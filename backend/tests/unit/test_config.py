from app.core.config import Settings


def test_csv_lists_are_split_and_emails_lowercased() -> None:
    s = Settings(
        GOOGLE_CLIENT_IDS="a, b ,",
        ALLOWED_EMAILS="X@Y.com,z@w.com",
    )
    assert s.GOOGLE_CLIENT_IDS == ["a", "b"]
    assert s.ALLOWED_EMAILS == ["x@y.com", "z@w.com"]
