"""Meu Pluggy: Open Finance in Brazil (Nubank, Inter), read-only and free for personal use.

The person connects their banks in Pluggy's own app; the item ids go in PLUGGY_ITEM_IDS.
Rules checked against real Meu Pluggy data in the old app:
  - Checking account amounts already have the app's sign (money out is negative); a
    credit card is the other way round (purchase positive, payment negative), so flip it.
  - A card purchase in another currency brings `amountInAccountCurrency`: the amount
    billed in the account's currency, which is what left. That is the one used.
  - `date` is an instant in UTC; the day that counts is the one in Brasília.
  - Paying the card bill moves money between the family's own products, so it is a
    transfer; otherwise the bill would count twice (the purchases and the payment).
  - Pluggy's own category marks money moving to the same person or to investments.
"""

import re
import time
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.connections.services.timestamps import instant
from app.core.config import settings
from app.core.exceptions import AppError, ConflictError
from app.statements.parsing.types import SUPPORTED_CURRENCIES, ParsedRow, RowError, RowKind

PROVIDER = "pluggy"
BRASILIA = ZoneInfo("America/Sao_Paulo")
CENTS = Decimal("0.01")
_TRANSFER_CATEGORIES = {"Same person transfer", "Transfer - Internal", "Credit card payment"}
_INVESTMENT_CATEGORIES = {"Investments", "Fixed income", "Variable income", "Investment funds"}
_TRANSFER_OPERATIONS = {"TRANSFERENCIA_MESMA_TITULARIDADE", "PAGAMENTO_FATURA"}
_INVESTMENT_OPERATIONS = {"RESGATE_APLIC_FINANCEIRA", "APLICACAO_FINANCEIRA"}
# Nubank's exact wording on the checking account; "fatura de luz" is spending.
_BILL_PAYMENT = re.compile(r"^pagamento d[ae] fatura( do cart[aã]o)?$", re.IGNORECASE)
# Inter's dollar Global Account: both directions are the person's own money.
_GLOBAL_ACCOUNT = re.compile(r"^(dep[óo]sito|resgate) - global account$", re.IGNORECASE)
# Buying or selling shares settles under the dividends category ("Débito B3 ... Compra").
_B3_TRADE = re.compile(r"\bB3\b.*\b(compra|venda)\b", re.IGNORECASE)

# Tests swap this for an httpx.MockTransport.
transport: httpx.AsyncBaseTransport | None = None


class PluggyError(AppError):
    status_code = 502
    code = "BANK_SERVICE"


def enabled() -> bool:
    return bool(settings.PLUGGY_CLIENT_ID and settings.PLUGGY_CLIENT_SECRET)


_key: tuple[str, float] | None = None


async def _send(client: httpx.AsyncClient, method: str, path: str, **kwargs: Any) -> Any:
    try:
        res = await client.request(method, path, **kwargs)
    except httpx.HTTPError as exc:
        raise PluggyError(f"Não deu para falar com a Pluggy ({exc}).") from exc
    if res.status_code >= 400:
        try:
            message = str(res.json().get("message") or "")
        except ValueError:
            message = res.text[:200]
        raise PluggyError(f"A Pluggy respondeu {res.status_code}: {message}")
    return res.json()


async def _get(path: str) -> Any:
    global _key
    async with httpx.AsyncClient(
        base_url=settings.PLUGGY_API_URL, timeout=30, transport=transport
    ) as client:
        if not _key or _key[1] < time.time():
            body = await _send(
                client,
                "POST",
                "/auth",
                json={
                    "clientId": settings.PLUGGY_CLIENT_ID,
                    "clientSecret": settings.PLUGGY_CLIENT_SECRET,
                },
            )
            # The key lasts 2 hours.
            _key = (str(body["apiKey"]), time.time() + 110 * 60)
        return await _send(client, "GET", path, headers={"X-API-KEY": _key[0]})


async def get_item(item_id: str) -> dict[str, Any]:
    item: dict[str, Any] = await _get(f"/items/{item_id}")
    return item


def check_item(item: dict[str, Any], now: datetime) -> datetime | None:
    """When the authorization ends; raises when the bank can't be read any more."""
    until = instant(item.get("consentExpiresAt"))
    if until and until < now:
        raise ConflictError(
            "A autorização deste banco no Meu Pluggy venceu. Autorize de novo no meu.pluggy.ai."
        )
    error = (item.get("error") or {}).get("code")
    if item.get("status") == "LOGIN_ERROR" or error:
        raise ConflictError(
            f"A Pluggy não consegue ler este banco ({error or item.get('status')}). "
            "Autorize de novo no meu.pluggy.ai."
        )
    return until


def bank_name(item: dict[str, Any]) -> str:
    name = str((item.get("connector") or {}).get("name") or "").strip()
    for known in ("Nubank", "Inter", "Itaú"):
        if known.lower() in name.lower():
            return known
    return name or "Banco"


async def list_accounts(item_id: str) -> list[dict[str, Any]]:
    data = await _get(f"/accounts?itemId={item_id}")
    return list(data.get("results") or [])


async def list_transactions(account_id: str) -> list[dict[str, Any]]:
    """Every transaction Pluggy keeps for the account (up to 12 months)."""
    base = f"/v2/transactions?accountId={account_id}"
    path: str | None = base
    found: list[dict[str, Any]] = []
    for _ in range(200):
        if path is None:
            return found
        page = await _get(path)
        found.extend(page.get("results") or [])
        nxt = page.get("next")
        if not nxt:
            path = None
        elif str(nxt).startswith("http"):
            path = str(nxt).replace(settings.PLUGGY_API_URL, "")
        else:
            path = f"{base}&cursor={nxt}"
    raise PluggyError("A Pluggy não terminou de listar as transações.")


def is_card(account: dict[str, Any]) -> bool:
    return account.get("type") == "CREDIT"


def _kind(tx: dict[str, Any], card: bool) -> RowKind:
    if _is_investment(tx):
        return "investment"
    if _is_transfer(tx, card):
        return "transfer"
    return "regular"


def _text(tx: dict[str, Any]) -> str:
    return str(tx.get("description") or "").strip()


def _is_investment(tx: dict[str, Any]) -> bool:
    category = tx.get("category")
    if category in _INVESTMENT_CATEGORIES or tx.get("operationType") in _INVESTMENT_OPERATIONS:
        return True
    return category == "Proceeds interests and dividends" and bool(_B3_TRADE.search(_text(tx)))


def _is_transfer(tx: dict[str, Any], card: bool) -> bool:
    if tx.get("category") in _TRANSFER_CATEGORIES:
        return True
    if tx.get("operationType") in _TRANSFER_OPERATIONS:
        return True
    description = _text(tx)
    if _GLOBAL_ACCOUNT.match(description):
        return True
    # Paying the card bill from the checking account; on the card itself it is a credit.
    return (
        not card
        and Decimal(str(tx.get("amount", 0))) < 0
        and bool(_BILL_PAYMENT.match(description))
    )


class _Unreadable(Exception):
    pass


def map_transactions(
    currency: str, card: bool, txs: list[dict[str, Any]], since: date
) -> tuple[list[ParsedRow], list[RowError]]:
    rows: list[ParsedRow] = []
    errors: list[RowError] = []
    for n, tx in enumerate(txs, start=1):
        try:
            row = _row(tx, currency, card, since)
        except _Unreadable as exc:
            errors.append(RowError(row=n, message=str(exc), raw=f"PLUGGY {tx.get('id')}"))
            continue
        if row is not None:
            rows.append(row)
    return rows, errors


def _row(tx: dict[str, Any], currency: str, card: bool, since: date) -> ParsedRow | None:
    """One transaction, or None when it is older than the sync window."""
    when = instant(tx.get("date"))
    if when is None:
        raise _Unreadable("Data ilegível")
    day = when.astimezone(BRASILIA).date()
    if day < since:
        return None
    value, cur = _value_and_currency(tx, currency)
    # JSON numbers become text first, so no arithmetic ever happens in float.
    amount = Decimal(str(value)).quantize(CENTS)
    description = re.sub(r"\s+", " ", _text(tx))
    if not description:
        raise _Unreadable("Transação sem descrição")
    return ParsedRow(
        date=day,
        description=description,
        amount=-amount if card else amount,
        currency=cur,
        raw=f"PLUGGY {tx.get('id')}",
        external_id=f"pluggy:{tx.get('id')}",
        kind=_kind(tx, card),
    )


def _value_and_currency(tx: dict[str, Any], currency: str) -> tuple[object, str]:
    """A purchase abroad counts in what the account was charged, when Pluggy knows it."""
    value: object = tx.get("amount")
    cur = currency
    tx_currency = str(tx.get("currencyCode") or currency).upper()
    if tx_currency != currency:
        if tx.get("amountInAccountCurrency") is not None:
            value = tx["amountInAccountCurrency"]
        else:
            cur = tx_currency
    if cur not in SUPPORTED_CURRENCIES:
        raise _Unreadable(f"Moeda não suportada: {cur}")
    return value, cur
