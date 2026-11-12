"""OFX statements (1.x SGML with unclosed value tags, and 2.x XML).

Each transaction carries a FITID, the bank's own id, which makes re-imports safe.
"""

import re
from datetime import date
from decimal import Decimal, InvalidOperation

from app.statements.parsing.banks import canonical_bank
from app.statements.parsing.errors import StatementError
from app.statements.parsing.tabular import decode_text
from app.statements.parsing.types import SUPPORTED_CURRENCIES, ParsedRow, ParsedStatement, RowError

_BLOCK = re.compile(
    r"<STMTTRN>(.*?)(?=</STMTTRN>|<STMTTRN>|</BANKTRANLIST>|</OFX>|\Z)", re.I | re.S
)


def is_ofx(data: bytes) -> bool:
    head = data[:200_000].lower()
    return b"<ofx>" in head and b"<stmttrn>" in head


def _field(block: str, tag: str) -> str:
    m = re.search(rf"<{tag}>\s*([^<\r\n]*)", block, re.I)
    return m[1].strip() if m else ""


def _date(raw: str) -> date:
    m = re.match(r"^(\d{4})(\d{2})(\d{2})", raw)
    try:
        if not m:
            raise ValueError
        return date(int(m[1]), int(m[2]), int(m[3]))
    except ValueError as exc:
        raise ValueError(f"Data inválida no OFX: {raw or 'vazia'}") from exc


def _amount(raw: str) -> Decimal:
    s = re.sub(r"\s", "", raw)
    if not re.fullmatch(r"[-+]?\d+(?:[.,]\d+)?", s):
        raise ValueError(f"Valor inválido no OFX: {raw or 'vazio'}")
    try:
        return Decimal(s.replace(",", "."))
    except InvalidOperation as exc:  # pragma: no cover - guarded by the regex
        raise ValueError(f"Valor inválido no OFX: {raw}") from exc


def read_ofx(data: bytes) -> ParsedStatement:
    text = decode_text(data)
    currency = _currency(text)
    statement = ParsedStatement(format="ofx", bank=canonical_bank(_field(text, "ORG")))
    for index, match in enumerate(_BLOCK.finditer(text), start=1):
        raw = re.sub(r"\s+", " ", match[1]).strip()
        try:
            statement.rows.append(_row(match[1], currency, raw))
        except ValueError as exc:
            statement.errors.append(RowError(row=index, message=str(exc), raw=raw))
    if not statement.rows and not statement.errors:
        raise StatementError("Este extrato não tem nenhuma transação. Nada para importar.")
    return statement


def _currency(text: str) -> str:
    currency = _field(text, "CURDEF").upper()
    if currency not in SUPPORTED_CURRENCIES:
        raise StatementError(
            f"Moeda do OFX não suportada: {currency or 'não informada'} (só BRL, USD e EUR)"
        )
    return currency


def _row(block: str, currency: str, raw: str) -> ParsedRow:
    description = re.sub(r"\s+", " ", _field(block, "MEMO") or _field(block, "NAME"))
    if not description:
        raise ValueError("Transação sem descrição no OFX")
    fitid = _field(block, "FITID") or None
    return ParsedRow(
        date=_date(_field(block, "DTPOSTED")),
        description=description,
        amount=_amount(_field(block, "TRNAMT")),
        currency=currency,
        raw=f"OFX FITID {fitid}" if fitid else raw,
        external_id=fitid,
    )
