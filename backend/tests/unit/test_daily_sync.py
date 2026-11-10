from datetime import datetime
from zoneinfo import ZoneInfo

from app.connections.daily import seconds_until_next_run

MADRID = ZoneInfo("Europe/Madrid")


def test_next_run_is_six_in_the_morning_in_madrid() -> None:
    assert seconds_until_next_run(datetime(2026, 11, 10, 5, 0, tzinfo=MADRID)) == 3600
    assert seconds_until_next_run(datetime(2026, 11, 10, 6, 0, tzinfo=MADRID)) == 24 * 3600
    assert seconds_until_next_run(datetime(2026, 11, 10, 23, 0, tzinfo=MADRID)) == 7 * 3600
