"""Which incoming rows are already in the account (spec: "Duplicados").

A row is the same transaction as one already saved when:
  1. it is the same line of a statement imported before (source key), or
  2. it has the same bank id (OFX FITID, Nubank id...), or
  3. same amount and same date, or
  4. same amount, dates up to 7 days apart and similar description, when the saved
     one came from another file format (a CSV and an OFX of the same account date
     things differently). Within one format, two equal purchases in the same week
     are two purchases, so rule 4 doesn't apply.
Every saved transaction absorbs at most one incoming row: two real identical coffees
in the new file, of which one was already saved, still bring in the second one.
"""

import hashlib
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from difflib import SequenceMatcher

from app.categories.services.categorize import merchant_key

NEAR_DAYS = 7


@dataclass(frozen=True)
class Incoming:
    date: date
    amount: Decimal
    description: str
    source_key: str
    external_id: str | None
    source_format: str


@dataclass(frozen=True)
class Existing:
    id: str
    date: date
    amount: Decimal
    description: str
    source_key: str | None
    external_id: str | None
    source_format: str


def source_keys(raw_lines: list[str]) -> list[str]:
    """Stable key per line of a file; repeated identical lines get their occurrence number."""
    seen: dict[str, int] = {}
    keys = []
    for raw in raw_lines:
        n = seen.get(raw, 0) + 1
        seen[raw] = n
        keys.append(hashlib.sha256(f"{raw}\0{n}".encode()).hexdigest())
    return keys


def similar(a: str, b: str) -> bool:
    ka, kb = merchant_key(a), merchant_key(b)
    if not ka or not kb:
        return False
    if ka in kb or kb in ka:
        return True
    return SequenceMatcher(None, ka, kb).ratio() >= 0.6


def find_duplicates(rows: list[Incoming], existing: list[Existing]) -> list[bool]:
    by_key = {e.source_key: e for e in existing if e.source_key}
    by_ext = {e.external_id: e for e in existing if e.external_id}
    used: set[str] = set()
    result: list[bool] = []

    def take(candidate: Existing | None) -> bool:
        if candidate is None or candidate.id in used:
            return False
        used.add(candidate.id)
        return True

    for row in rows:
        if take(by_key.get(row.source_key)):
            result.append(True)
            continue
        if row.external_id and take(by_ext.get(row.external_id)):
            result.append(True)
            continue
        same_day = next(
            (
                e
                for e in existing
                if e.id not in used and e.amount == row.amount and e.date == row.date
            ),
            None,
        )
        if take(same_day):
            result.append(True)
            continue
        near = next(
            (
                e
                for e in existing
                if e.id not in used
                and e.amount == row.amount
                and e.source_format != row.source_format
                and abs((e.date - row.date).days) <= NEAR_DAYS
                and similar(e.description, row.description)
            ),
            None,
        )
        result.append(take(near))
    return result
