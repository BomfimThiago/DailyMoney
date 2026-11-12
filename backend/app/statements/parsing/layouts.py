"""Headers exported by known banks.

A generic header ("Fecha;Concepto;Importe") doesn't say which bank it is, so only
distinctive headers go here. Matching is exact, after normalising case and spaces.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass
from functools import partial


@dataclass(frozen=True)
class KnownLayout:
    headers: tuple[str, ...]
    bank: str
    # Files without any currency in them (Nubank is always in reais).
    currency: str | None = None
    # Card statements list purchases as positive amounts.
    invert_sign: bool = False
    is_card: bool = False
    # Column and values the bank uses for money moving between its own balances.
    transfer_column: str | None = None
    transfer_values: frozenset[str] = frozenset()
    # Columns joined into the description when one column alone says too little.
    description_columns: tuple[str, ...] = ()


_WISE = (
    "transferwise id", "date", "date time", "amount", "currency", "description",
    "payment reference", "running balance", "exchange from", "exchange to", "exchange rate",
    "payer name", "payee name", "payee account number", "merchant", "card last four digits",
    "card holder full name", "attachment", "note", "total fees", "exchange to amount",
    "transaction type", "transaction details type",
)  # fmt: skip

LAYOUTS = (
    KnownLayout(("data", "valor", "identificador", "descrição"), "Nubank", currency="BRL"),
    KnownLayout(
        ("date", "title", "amount"), "Nubank", currency="BRL", invert_sign=True, is_card=True
    ),
    KnownLayout(
        (
            "type",
            "product",
            "started date",
            "completed date",
            "description",
            "amount",
            "fee",
            "currency",
            "state",
            "balance",
        ),
        "Revolut",
    ),  # fmt: skip
    KnownLayout(
        (
            "tipo",
            "producto",
            "fecha de inicio",
            "fecha de finalización",
            "descripción",
            "importe",
            "comisión",
            "divisa",
            "state",
            "saldo",
        ),
        "Revolut",
    ),  # fmt: skip
    KnownLayout(
        ("data lançamento", "histórico", "descrição", "valor", "saldo"),
        "Inter",
        currency="BRL",
        description_columns=("histórico", "descrição"),
    ),
    KnownLayout(
        _WISE,
        "Wise",
        transfer_column="transaction details type",
        transfer_values=frozenset({"CONVERSION"}),
    ),
)


def normalise_header(cell: str) -> str:
    return re.sub(r"\s+", " ", cell.replace("﻿", "")).strip().lower()


@dataclass(frozen=True)
class LayoutMatch:
    layout: KnownLayout
    is_transfer: Callable[[list[str]], bool]
    describe: Callable[[list[str]], str] | None = None


def match_layout(headers: list[str]) -> LayoutMatch | None:
    got = _trimmed(headers)
    layout = next((lay for lay in LAYOUTS if lay.headers == got), None)
    if layout is None:
        return None
    col = got.index(layout.transfer_column) if layout.transfer_column else -1
    parts = tuple(got.index(c) for c in layout.description_columns)
    return LayoutMatch(
        layout,
        partial(_is_transfer, col, layout.transfer_values),
        partial(_describe, parts) if parts else None,
    )


def _trimmed(headers: list[str]) -> tuple[str, ...]:
    """Normalised headers without the empty trailing columns spreadsheets leave behind."""
    got = [normalise_header(h) for h in headers]
    while got and got[-1] == "":
        got.pop()
    return tuple(got)


def _is_transfer(col: int, values: frozenset[str], cells: list[str]) -> bool:
    if col < 0 or col >= len(cells):
        return False
    return cells[col].strip().upper() in values


def _describe(parts: tuple[int, ...], cells: list[str]) -> str:
    texts = [cells[i].strip() for i in parts if i < len(cells) and cells[i].strip()]
    return ": ".join(texts)
