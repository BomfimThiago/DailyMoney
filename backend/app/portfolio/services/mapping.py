"""Pluggy investments into positions, with no AI. Rules checked against real Meu Pluggy
data in the old app (Inter and Nubank, Nov 2026):
  - `balance` is the net balance (tax and fees taken), with cents;
  - a withdrawn one (TOTAL_WITHDRAWAL) comes with balance zero and stays in the list;
  - fixed income brings the amount put in (`amountOriginal`), due date and agreed rate;
    shares, real estate funds and ETFs don't (only code and balance);
  - dates are UTC instants: the day that counts is the one in Brasília (the due date
    comes at 03:00 UTC);
  - it can come without a name (seen on a withdrawn Nubank CDB): use the code or issuer.
"""

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any
from zoneinfo import ZoneInfo

from app.connections.services.timestamps import instant
from app.families.models import Currency

BRASILIA = ZoneInfo("America/Sao_Paulo")
CENTS = Decimal("0.01")
NO_NAME = "Investimento sem nome no banco"


@dataclass
class Position:
    external_id: str
    name: str
    type: str
    subtype: str | None
    issuer: str | None
    code: str | None
    currency: Currency
    balance: Decimal
    amount_original: Decimal | None
    rate: Decimal | None
    rate_type: str | None
    fixed_annual_rate: Decimal | None
    due_date: date | None
    status: str
    value_date: date


class _Unreadable(Exception):
    pass


def _text(value: object) -> str | None:
    cleaned = re.sub(r"\s+", " ", str(value or "")).strip()
    return cleaned or None


def _dec(value: object, what: str) -> Decimal:
    # JSON numbers go through text: no arithmetic ever happens in float.
    try:
        d = Decimal(str(value))
    except InvalidOperation as exc:
        raise _Unreadable(f"{what} inválido") from exc
    if not d.is_finite():
        raise _Unreadable(f"{what} inválido")
    return d


def _opt_dec(value: object, what: str) -> Decimal | None:
    return None if value is None else _dec(value, what)


def _day(value: object, what: str) -> date:
    when = instant(value)
    if when is None:
        raise _Unreadable(f"{what} ilegível")
    return when.astimezone(BRASILIA).date()


def map_investment(inv: dict[str, Any]) -> Position:
    try:
        currency = Currency(str(inv.get("currencyCode") or "").upper())
    except ValueError as exc:
        raise _Unreadable(f"moeda não suportada ({inv.get('currencyCode')})") from exc
    if inv.get("balance") is None:
        raise _Unreadable("sem saldo")
    original = _opt_dec(inv.get("amountOriginal"), "valor aplicado")
    return Position(
        external_id=str(inv["id"]),
        name=_text(inv.get("name"))
        or _text(inv.get("code"))
        or _text(inv.get("issuer"))
        or NO_NAME,
        type=_text(inv.get("type")) or "OTHER",
        subtype=_text(inv.get("subtype")),
        issuer=_text(inv.get("issuer")),
        code=_text(inv.get("code")),
        currency=currency,
        balance=_dec(inv["balance"], "saldo").quantize(CENTS),
        amount_original=original.quantize(CENTS) if original is not None else None,
        rate=_opt_dec(inv.get("rate"), "taxa"),
        rate_type=(_text(inv.get("rateType")) or "").upper() or None,
        fixed_annual_rate=_opt_dec(inv.get("fixedAnnualRate"), "taxa prefixada"),
        due_date=_day(inv["dueDate"], "vencimento") if inv.get("dueDate") else None,
        status=(_text(inv.get("status")) or "ACTIVE").upper(),
        value_date=_day(inv.get("date"), "data do saldo"),
    )


def map_investments(invs: list[dict[str, Any]]) -> tuple[list[Position], list[str]]:
    """All of them; one that can't be read becomes an error with its name, the others stay."""
    positions: list[Position] = []
    errors: list[str] = []
    for inv in invs:
        try:
            positions.append(map_investment(inv))
        except (_Unreadable, KeyError) as exc:
            errors.append(f"{_text(inv.get('name')) or inv.get('id')}: {exc}")
    return positions, errors
