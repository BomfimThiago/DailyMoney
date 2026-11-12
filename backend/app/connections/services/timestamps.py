from datetime import datetime


def instant(text: object) -> datetime | None:
    """An ISO 8601 instant from a bank API ("Z" included); None when absent or unreadable."""
    if not text:
        return None
    try:
        return datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    except ValueError:
        return None
