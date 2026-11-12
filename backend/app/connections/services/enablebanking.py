"""Enable Banking: Open Banking in Europe (Wise, Revolut, CaixaBank), read-only.

Every request carries a JWT signed (RS256) with the application's private key, whose
`kid` is the application id. Authorizing a bank is a redirect: the app asks for an
authorization address, the person logs in at the bank and approves, and the bank sends
them back with a `code` that becomes a session listing the accounts they shared.

Transactions follow ISO 20022, the same for every bank:
  - `transaction_amount.amount` is text without a sign; `credit_debit_indicator` says the
    direction (DBIT left the account, CRDT came in), cards included.
  - Only booked lines (`status` BOOK) come in: pending ones still change amount and
    reference at the bank and arrive, booked, on a later sync.
  - `entry_reference` is the bank's reference for the line. `transaction_id` is not
    stable between reads, the API says, so it is not used.
"""

import base64
import hashlib
import re
import time
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx
import jwt

from app.core.config import settings
from app.core.exceptions import AppError, ConflictError
from app.statements.parsing.types import SUPPORTED_CURRENCIES, ParsedRow, RowError

PROVIDER = "enablebanking"
# PSD2: the bank may allow less; ask for the most it accepts, up to 180 days.
MAX_CONSENT_SECONDS = 180 * 86_400
_EXPIRED = {
    "EXPIRED_SESSION",
    "CLOSED_SESSION",
    "REVOKED_SESSION",
    "UNAUTHORIZED_ACCESS",
    "ACCESS_DENIED",
}
# Tests swap this for an httpx.MockTransport.
transport: httpx.AsyncBaseTransport | None = None


class BankServiceError(AppError):
    status_code = 502
    code = "BANK_SERVICE"


class NotConfiguredError(AppError):
    status_code = 503
    code = "BANK_NOT_CONFIGURED"


def enabled() -> bool:
    return bool(settings.ENABLE_BANKING_APP_ID and settings.ENABLE_BANKING_PRIVATE_KEY)


def _private_key() -> str:
    value = settings.ENABLE_BANKING_PRIVATE_KEY.strip()
    if "-----BEGIN" in value:
        return value.replace("\\n", "\n")
    try:
        return base64.b64decode(value).decode()
    except ValueError as exc:
        raise NotConfiguredError("A chave da Enable Banking no servidor está ilegível.") from exc


_token: tuple[str, float] | None = None


def _bearer() -> str:
    global _token
    if not enabled():
        raise NotConfiguredError("Bancos europeus ainda não foram configurados no servidor.")
    if _token and _token[1] > time.time():
        return _token[0]
    now = int(time.time())
    token = jwt.encode(
        {"iss": "enablebanking.com", "aud": "api.enablebanking.com", "iat": now, "exp": now + 3600},
        _private_key(),
        algorithm="RS256",
        headers={"kid": settings.ENABLE_BANKING_APP_ID},
    )
    _token = (token, time.time() + 50 * 60)
    return token


async def _request(method: str, path: str, body: dict[str, Any] | None = None) -> Any:
    headers = {"Authorization": f"Bearer {_bearer()}"}
    try:
        async with httpx.AsyncClient(
            base_url=settings.ENABLE_BANKING_API_URL, timeout=60, transport=transport
        ) as client:
            res = await client.request(method, path, json=body, headers=headers)
    except httpx.HTTPError as exc:
        raise BankServiceError(f"Não deu para falar com a Enable Banking ({exc}).") from exc
    if res.status_code >= 400:
        raise _error(res)
    return res.json() if res.content else {}


def _error(res: httpx.Response) -> AppError:
    try:
        data = res.json()
    except ValueError:
        data = {}
    code = str(data.get("error") or "") if isinstance(data, dict) else ""
    message = str(data.get("message") or "") if isinstance(data, dict) else ""
    if code in _EXPIRED:
        return ConflictError("O banco não autoriza mais a leitura. Conecte de novo.")
    detail = f" {code}" if code else ""
    return BankServiceError(
        f"A Enable Banking respondeu {res.status_code}{detail}: {message or res.text[:200]}"
    )


async def list_banks(country: str) -> list[dict[str, Any]]:
    data = await _request("GET", f"/aspsps?country={country}")
    return [
        a
        for a in data.get("aspsps", [])
        if not a.get("psu_types") or "personal" in a.get("psu_types", [])
    ]


async def start_authorization(
    bank: str, country: str, valid_until: str, state: str, redirect_url: str
) -> str:
    data = await _request(
        "POST",
        "/auth",
        {
            "access": {"valid_until": valid_until},
            "aspsp": {"name": bank, "country": country},
            "state": state,
            "redirect_url": redirect_url,
            "psu_type": "personal",
        },
    )
    return str(data["url"])


async def create_session(code: str) -> dict[str, Any]:
    data: dict[str, Any] = await _request("POST", "/sessions", {"code": code})
    return data


async def get_session(session_id: str) -> dict[str, Any]:
    data: dict[str, Any] = await _request("GET", f"/sessions/{session_id}")
    return data


async def delete_session(session_id: str) -> None:
    await _request("DELETE", f"/sessions/{session_id}")


async def list_transactions(account_uid: str, since: date) -> list[dict[str, Any]]:
    path = f"/accounts/{account_uid}/transactions?date_from={since.isoformat()}"
    found: list[dict[str, Any]] = []
    key: str | None = None
    for _ in range(200):
        page = await _request("GET", path + (f"&continuation_key={key}" if key else ""))
        found.extend(page.get("transactions") or [])
        key = page.get("continuation_key") or None
        if not key:
            return found
    raise BankServiceError("A Enable Banking não terminou de listar as transações.")


# ── accounts and transactions → the app's rows ───────────────────────────────


def account_key(account: dict[str, Any]) -> str:
    """Same in every session (a new authorization must not duplicate anything)."""
    if account.get("identification_hash"):
        return str(account["identification_hash"])
    ident = account.get("account_id") or {}
    number = ident.get("iban") or (ident.get("other") or {}).get("identification")
    if number:
        clean = re.sub(r"\s+", "", str(number)).upper()
        return hashlib.sha256(clean.encode()).hexdigest()
    return f"uid:{account['uid']}"


def account_last4(account: dict[str, Any]) -> str | None:
    ident = account.get("account_id") or {}
    number = re.sub(r"\s+", "", str(ident.get("iban") or ""))
    return number[-4:] if len(number) >= 4 else None


def is_card(account: dict[str, Any]) -> bool:
    return account.get("cash_account_type") == "CARD"


def _clean(text: object) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _description(tx: dict[str, Any]) -> str:
    party, remittance = _counterparty(tx), _remittance(tx)
    if party and remittance:
        return remittance if party.lower() in remittance.lower() else f"{party} · {remittance}"
    return party or remittance or _fallback_text(tx)


def _counterparty(tx: dict[str, Any]) -> str:
    """Who is on the other side: whom we paid, or who paid us."""
    side = tx.get("creditor") if tx.get("credit_debit_indicator") == "DBIT" else tx.get("debtor")
    return _clean((side or {}).get("name"))


def _remittance(tx: dict[str, Any]) -> str:
    return _clean(" ".join(tx.get("remittance_information") or []))


def _fallback_text(tx: dict[str, Any]) -> str:
    code = (tx.get("bank_transaction_code") or {}).get("description")
    return _clean(tx.get("note")) or _clean(code)


class _Unreadable(Exception):
    pass


def _day(tx: dict[str, Any]) -> date:
    text = tx.get("booking_date") or tx.get("value_date") or tx.get("transaction_date") or ""
    try:
        return date.fromisoformat(str(text))
    except ValueError as exc:
        raise _Unreadable(f"Data ilegível: {text or 'vazia'}") from exc


def _amount(tx: dict[str, Any]) -> Decimal:
    text = str((tx.get("transaction_amount") or {}).get("amount", "")).strip()
    try:
        value = abs(Decimal(text))
    except InvalidOperation as exc:
        raise _Unreadable(f"Valor ilegível: {text or 'vazio'}") from exc
    if not value.is_finite():
        raise _Unreadable(f"Valor ilegível: {text}")
    return -value if tx.get("credit_debit_indicator") == "DBIT" else value


def map_transactions(
    txs: list[dict[str, Any]], currency: str | None, since: date
) -> tuple[list[ParsedRow], list[RowError]]:
    rows: list[ParsedRow] = []
    errors: list[RowError] = []
    for n, tx in enumerate(txs, start=1):
        if tx.get("status") != "BOOK":
            continue
        try:
            row = _row(tx, currency, since)
        except _Unreadable as exc:
            errors.append(RowError(row=n, message=str(exc), raw=_raw_label(tx, n)))
            continue
        if row is not None:
            rows.append(row)
    return rows, errors


def _raw_label(tx: dict[str, Any], n: int) -> str:
    ref = _clean(tx.get("entry_reference"))
    return f"EB {ref}" if ref else f"EB linha {n}"


def _row(tx: dict[str, Any], currency: str | None, since: date) -> ParsedRow | None:
    """One booked transaction, or None when it is older than the sync window."""
    day = _day(tx)
    if day < since:
        return None
    amount = _amount(tx)
    cur = _currency(tx, currency)
    description = _description(tx)
    if not description:
        raise _Unreadable("Transação sem descrição")
    ref = _clean(tx.get("entry_reference"))
    return ParsedRow(
        date=day,
        description=description,
        amount=amount,
        currency=cur,
        raw=f"EB {ref}" if ref else f"EB {day.isoformat()}|{amount}|{cur}|{description}",
        external_id=f"eb:{ref}" if ref else None,
    )


def _currency(tx: dict[str, Any], account_currency: str | None) -> str:
    amount = tx.get("transaction_amount") or {}
    cur = str(amount.get("currency") or account_currency or "").upper()
    if cur not in SUPPORTED_CURRENCIES:
        raise _Unreadable(f"Moeda não suportada: {cur or 'vazia'}")
    return cur
