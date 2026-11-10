"""Headers exported by known banks.

A generic header ("Fecha;Concepto;Importe") doesn't say which bank it is, so only
distinctive headers go here. Matching is exact, after normalising case and spaces.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass


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


def match_layout(headers: list[str]) -> LayoutMatch | None:
    got = tuple(normalise_header(h) for h in headers)
    while got and got[-1] == "":
        got = got[:-1]
    layout = next((lay for lay in LAYOUTS if lay.headers == got), None)
    if layout is None:
        return None
    col = got.index(layout.transfer_column) if layout.transfer_column else -1

    def is_transfer(cells: list[str]) -> bool:
        if col < 0 or col >= len(cells):
            return False
        return cells[col].strip().upper() in layout.transfer_values

    return LayoutMatch(layout, is_transfer)
