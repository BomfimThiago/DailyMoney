"""ECB reference rates through Frankfurter (https://frankfurter.dev), free and keyless."""

from datetime import date
from decimal import Decimal

import httpx

from app.core.config import settings
from app.families.models import Currency

# Tests swap this for an httpx.MockTransport.
transport: httpx.AsyncBaseTransport | None = None

QUOTES = [c for c in Currency if c != Currency.EUR]

Rates = dict[date, dict[Currency, Decimal]]


async def fetch(lo: date, hi: date) -> Rates:
    """Euro rates for every ECB business day between lo and hi (inclusive)."""
    url = f"{settings.FX_API_URL}/{lo.isoformat()}..{hi.isoformat()}"
    params = {"base": "EUR", "symbols": ",".join(QUOTES)}
    async with httpx.AsyncClient(transport=transport, timeout=10) as client:
        response = await client.get(url, params=params)
    response.raise_for_status()
    # parse_float: rates go straight to Decimal, never through float.
    data = response.json(parse_float=Decimal, parse_int=Decimal)
    return {
        date.fromisoformat(day): {Currency(code): Decimal(rate) for code, rate in rates.items()}
        for day, rates in data["rates"].items()
    }
