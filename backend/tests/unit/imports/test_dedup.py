from datetime import date
from decimal import Decimal

from app.imports.services.dedup import Existing, Incoming, find_duplicates, source_keys


def _in(
    d: str, amount: str, desc: str = "Mercadona", key: str = "", ext: str | None = None
) -> Incoming:
    return Incoming(
        date=date.fromisoformat(d),
        amount=Decimal(amount),
        description=desc,
        source_key=key or f"{d}{amount}{desc}",
        external_id=ext,
        source_format="csv",
    )


def _ex(
    d: str,
    amount: str,
    desc: str = "Mercadona",
    key: str = "other",
    ext: str | None = None,
    fmt: str = "csv",
) -> Existing:
    return Existing(
        id=f"{d}{amount}{desc}{key}",
        date=date.fromisoformat(d),
        amount=Decimal(amount),
        description=desc,
        source_key=key,
        external_id=ext,
        source_format=fmt,
    )


def test_same_line_reimported_is_duplicate() -> None:
    rows = [_in("2026-10-01", "-10", key="k1")]
    assert find_duplicates(rows, [_ex("2026-10-01", "-10", key="k1")]) == [True]


def test_same_bank_id_is_duplicate_even_if_values_differ() -> None:
    rows = [_in("2026-10-02", "-10.50", ext="fit-1")]
    assert find_duplicates(rows, [_ex("2026-10-01", "-10", ext="fit-1")]) == [True]


def test_same_amount_and_date_is_duplicate() -> None:
    assert find_duplicates([_in("2026-10-01", "-10", "MERCADONA 123")], [_ex("2026-10-01", "-10")])


def test_each_existing_matches_only_once() -> None:
    # Two real identical coffees in the new file; only one was already imported.
    rows = [_in("2026-10-01", "-3", "Cafe", key="a"), _in("2026-10-01", "-3", "Cafe", key="b")]
    assert find_duplicates(rows, [_ex("2026-10-01", "-3", "Cafe")]) == [True, False]


def test_a_saved_line_is_not_taken_by_a_new_look_alike_before_it() -> None:
    # A second coffee bought the same day comes first in the bank's list; the first one
    # was synced before. The new coffee must stay new, not steal the saved line's match.
    rows = [_in("2026-10-01", "-3", "Cafe", key="new"), _in("2026-10-01", "-3", "Cafe", key="a")]
    assert find_duplicates(rows, [_ex("2026-10-01", "-3", "Cafe", key="a")]) == [False, True]


def test_near_date_similar_description_from_another_format_is_duplicate() -> None:
    rows = [_in("2026-10-03", "-45.20", "COMPRA MERCADONA MADRID")]
    existing = [_ex("2026-10-01", "-45.20", "Mercadona", fmt="ofx")]
    assert find_duplicates(rows, existing) == [True]


def test_near_date_from_same_format_is_not_duplicate() -> None:
    # The same coffee twice in a week is two purchases, not one.
    rows = [_in("2026-10-03", "-3", "Cafe")]
    assert find_duplicates(rows, [_ex("2026-10-01", "-3", "Cafe")]) == [False]


def test_near_date_but_different_description_is_not_duplicate() -> None:
    rows = [_in("2026-10-03", "-45.20", "Farmacia")]
    assert find_duplicates(rows, [_ex("2026-10-01", "-45.20", "Mercadona", fmt="ofx")]) == [False]


def test_more_than_7_days_is_not_duplicate() -> None:
    rows = [_in("2026-10-10", "-45.20", "Mercadona")]
    assert find_duplicates(rows, [_ex("2026-10-01", "-45.20", "Mercadona", fmt="ofx")]) == [False]


def test_source_keys_number_repeated_lines() -> None:
    keys = source_keys(["a;1", "a;1", "b;2"])
    assert len(set(keys)) == 3
    assert source_keys(["a;1", "a;1", "b;2"]) == keys
