"""Reads every connected bank once a day, early in the morning in Madrid.

Runs as its own container (`sync` in infra/docker-compose.prod.yml):
    python -m app.connections.daily
"""

import asyncio
import logging
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.connections.services import connection_service
from app.db import models as _models  # noqa: F401  (registers every model on Base)
from app.db.session import SessionLocal

log = logging.getLogger("dailymoney.sync")
MADRID = ZoneInfo("Europe/Madrid")
RUN_AT = time(6, 0)


def seconds_until_next_run(now: datetime) -> float:
    run = datetime.combine(now.date(), RUN_AT, tzinfo=MADRID)
    if run <= now:
        run = datetime.combine(now.date() + timedelta(days=1), RUN_AT, tzinfo=MADRID)
    return (run - now).total_seconds()


async def run_once() -> None:
    async with SessionLocal() as db:
        results = await connection_service.sync_all(db)
    for r in results:
        new = sum(a.new for a in r.accounts)
        log.info("%s: %d new, error: %s", r.connection.bank, new, r.connection.last_error)


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    while True:
        await asyncio.sleep(seconds_until_next_run(datetime.now(MADRID)))
        try:
            await run_once()
        except Exception:  # a bad night must not stop the next ones
            log.exception("daily bank sync failed")


if __name__ == "__main__":  # pragma: no cover
    asyncio.run(main())
