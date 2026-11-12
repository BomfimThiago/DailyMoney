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
from collections.abc import Callable
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
    matcher = _Matcher(existing)
    # Exact matches first: a saved line must not be taken by a look-alike row that comes
    # earlier in the file (a second coffee the same day), leaving its own line "new".
    exact = [matcher.exact(row) for row in rows]
    return [hit or matcher.fuzzy(row) for row, hit in zip(rows, exact, strict=True)]


class _Matcher:
    """Saved transactions, each taken by at most one incoming row."""

    def __init__(self, existing: list[Existing]) -> None:
        self.existing = existing
        self.by_key = {e.source_key: e for e in existing if e.source_key}
        self.by_ext = {e.external_id: e for e in existing if e.external_id}
        self.used: set[str] = set()

    def exact(self, row: Incoming) -> bool:
        """Rules 1 and 2: the same statement line, or the same bank id."""
        if self._take(self.by_key.get(row.source_key)):
            return True
        return bool(row.external_id) and self._take(self.by_ext.get(row.external_id or ""))

    def fuzzy(self, row: Incoming) -> bool:
        """Rule 3, then rule 4."""
        return self._take(self._first(row, _same_day)) or self._take(self._first(row, _near))

    def _first(self, row: Incoming, rule: Callable[[Existing, Incoming], bool]) -> Existing | None:
        return next((e for e in self.existing if e.id not in self.used and rule(e, row)), None)

    def _take(self, candidate: Existing | None) -> bool:
        if candidate is None or candidate.id in self.used:
            return False
        self.used.add(candidate.id)
        return True


def _same_day(saved: Existing, row: Incoming) -> bool:
    return saved.amount == row.amount and saved.date == row.date


def _near(saved: Existing, row: Incoming) -> bool:
    return (
        saved.amount == row.amount
        and saved.source_format != row.source_format
        and abs((saved.date - row.date).days) <= NEAR_DAYS
        and similar(saved.description, row.description)
    )
