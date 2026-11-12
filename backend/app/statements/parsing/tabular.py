"""CSV and spreadsheet statements: find the header, map columns, read each row.

Deterministic on purpose: values and signs come straight from the file, never from a
guess. A row that can't be read becomes a visible error; the other rows still import.
"""

import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app.statements.parsing.errors import StatementError
from app.statements.parsing.layouts import LayoutMatch, match_layout, normalise_header
from app.statements.parsing.types import (
    SUPPORTED_CURRENCIES,
    ParsedRow,
    ParsedStatement,
    RowError,
)

Cell = object  # str from CSV; str, number, date or None from XLSX

# Header keywords in Portuguese, Spanish and English.
_ROLE_PATTERNS: dict[str, re.Pattern[str]] = {
    "external_id": re.compile(r"^(identificador|id|transferwise id|transaction id|fitid)$"),
    "fee": re.compile(r"comisi|comiss|\bfees?\b|tarifa|encargo"),
    "balance": re.compile(r"saldo|balance"),
    "state": re.compile(r"^(state|estado|status|situação)$"),
    "currency": re.compile(r"divisa|moneda|currency|moeda"),
    "date": re.compile(r"fecha|data|date"),
    "amount": re.compile(r"importe|monto|valor|amount|cantidad|montante|quantia"),
    "description": re.compile(
        r"descrip|descri|concepto|detalle|memo|hist[oó]rico|lan[çc]amento|movimiento"
        r"|title|t[ií]tulo|merchant|estabelecimento|beneficiario|payee"
    ),
}
# Specific roles first, so "amount" doesn't grab the fee or balance columns.
_ROLE_ORDER = ("external_id", "fee", "balance", "state", "currency", "date", "amount")
_HEADER_SEARCH_ROWS = 30

_MONTHS = {
    "jan": 1, "feb": 2, "fev": 2, "mar": 3, "apr": 4, "abr": 4, "may": 5, "mai": 5,
    "jun": 6, "jul": 7, "aug": 8, "ago": 8, "sep": 9, "set": 9, "oct": 10, "out": 10,
    "nov": 11, "dec": 12, "dez": 12, "dic": 12, "ene": 1,
}  # fmt: skip


@dataclass(frozen=True)
class _Columns:
    date: int
    amount: int
    description: int
    currency: int | None = None
    external_id: int | None = None
    state: int | None = None


def read_csv(data: bytes, default_currency: str | None = None) -> ParsedStatement:
    text = decode_text(data)
    delimiter = _detect_delimiter(text)
    grid: list[list[Cell]] = [list(r) for r in csv.reader(io.StringIO(text), delimiter=delimiter)]
    return read_grid(grid, default_currency=default_currency, fmt="csv", delimiter=delimiter)


def read_grid(
    grid: list[list[Cell]],
    default_currency: str | None = None,
    fmt: str = "csv",
    delimiter: str = ";",
) -> ParsedStatement:
    rows = [r for r in grid if any(_text(c) for c in r)]
    header_at = _find_header(rows)
    if header_at is None:
        raise StatementError(
            "Não reconheci as colunas do arquivo. Ele precisa ter data, valor e descrição."
        )
    headers = [_text(c) for c in rows[header_at]]
    data_rows = rows[header_at + 1 :]
    if not data_rows:
        raise StatementError("Este extrato não tem nenhuma transação. Nada para importar.")

    layout = match_layout(headers)
    columns = _infer_columns(headers, data_rows)
    decimal_sep = detect_decimal_separator(
        [c for r in data_rows if isinstance(c := _cell(r, columns.amount), str)]
    )
    statement = ParsedStatement(
        format="xlsx" if fmt == "xlsx" else "csv",
        bank=layout.layout.bank if layout else None,
        is_card=bool(layout and layout.layout.is_card),
    )
    for index, cells in enumerate(data_rows, start=1):
        texts = [_text(c) for c in cells]
        raw = delimiter.join(texts)
        try:
            statement.rows.append(
                _read_row(cells, texts, raw, columns, decimal_sep, layout, default_currency)
            )
        except ValueError as exc:
            statement.errors.append(RowError(row=index, message=str(exc), raw=raw))
    return statement


def _read_row(
    cells: list[Cell],
    texts: list[str],
    raw: str,
    columns: _Columns,
    decimal_sep: str,
    layout: LayoutMatch | None,
    default_currency: str | None,
) -> ParsedRow:
    amount_cell = _cell(cells, columns.amount)
    amount = _to_decimal(amount_cell, decimal_sep)
    if layout and layout.layout.invert_sign:
        amount = -amount
    if layout and layout.describe:
        description = layout.describe(texts)
    else:
        description = _text(_cell(cells, columns.description))
    description = re.sub(r"\s+", " ", description).strip()
    if not description:
        raise ValueError("Linha sem descrição")
    return ParsedRow(
        date=_to_date(_cell(cells, columns.date)),
        description=description,
        amount=amount,
        currency=_resolve_currency(cells, columns, layout, default_currency),
        raw=raw,
        external_id=_text(_cell(cells, columns.external_id)) or None,
        is_transfer=bool(layout and layout.is_transfer(texts)),
    )


def _resolve_currency(
    cells: list[Cell],
    columns: _Columns,
    layout: LayoutMatch | None,
    default_currency: str | None,
) -> str:
    if columns.currency is not None:
        cell = _text(_cell(cells, columns.currency)).upper()
        found = currency_in_text(cell)
        if found:
            return found
        if re.fullmatch(r"[A-Z]{3}", cell):
            raise ValueError(f"Moeda {cell} não é suportada (só BRL, USD e EUR)")
    in_amount = currency_in_text(_text(_cell(cells, columns.amount)))
    if in_amount:
        return in_amount
    if layout and layout.layout.currency:
        return layout.layout.currency
    if default_currency in SUPPORTED_CURRENCIES:
        return str(default_currency)
    raise ValueError("Não foi possível saber a moeda desta linha")


def currency_in_text(raw: str) -> str | None:
    s = raw.upper()
    if "BRL" in s or "R$" in s:
        return "BRL"
    if "EUR" in s or "€" in s:
        return "EUR"
    if "USD" in s or "$" in s:
        return "USD"
    return None


# ── columns ──────────────────────────────────────────────────────────────────


def _roles_in(headers: list[str]) -> dict[str, int]:
    norm = [normalise_header(h) for h in headers]
    used: set[int] = set()
    roles: dict[str, int] = {}
    for role in (*_ROLE_ORDER, "description"):
        for i, name in enumerate(norm):
            if i in used or not name or not _ROLE_PATTERNS[role].search(name):
                continue
            # "Fecha valor" / "Data valor" is a date column, not the amount.
            if role == "amount" and _ROLE_PATTERNS["date"].search(name):
                continue
            roles[role] = i
            used.add(i)
            break
    return roles


def _find_header(rows: list[list[Cell]]) -> int | None:
    for i, row in enumerate(rows[:_HEADER_SEARCH_ROWS]):
        roles = _roles_in([_text(c) for c in row])
        if "date" in roles and "amount" in roles:
            return i
    return None


def _infer_columns(headers: list[str], data_rows: list[list[Cell]]) -> _Columns:
    roles = _roles_in(headers)
    description = roles.get("description")
    if description is None:
        description = _most_textual_column(headers, data_rows, set(roles.values()))
    return _Columns(
        date=roles["date"],
        amount=roles["amount"],
        description=description,
        currency=roles.get("currency"),
        external_id=roles.get("external_id"),
        state=roles.get("state"),
    )


def _most_textual_column(headers: list[str], data_rows: list[list[Cell]], used: set[int]) -> int:
    """The unused column whose values look most like free text (not dates or numbers).

    A column with no text at all never qualifies: a reference number is no description.
    """
    sample = data_rows[:20]
    scores = {i: _textual_score([_text(_cell(r, i)) for r in sample]) for i in range(len(headers))}
    candidates = {i: score for i, score in scores.items() if i not in used and score > 0}
    if not candidates:
        raise StatementError("Não encontrei a coluna de descrição no arquivo.")
    # Ties go to the leftmost column.
    return max(candidates, key=lambda i: (candidates[i], -i))


def _textual_score(texts: list[str]) -> float:
    textual = [t for t in texts if t and not _looks_numeric_or_date(t)]
    return len(textual) + sum(len(t) for t in textual) / 1000


def _looks_numeric_or_date(text: str) -> bool:
    return bool(re.fullmatch(r"[\d\s.,/:\-+()€$R]*", text))


# ── values ───────────────────────────────────────────────────────────────────


def parse_amount(raw: str, decimal_sep: str) -> Decimal:
    s = (raw or "").strip().replace("−", "-")
    if not re.search(r"\d", s):
        raise ValueError(f"Valor inválido: {raw!r}")
    negative = False
    if re.fullmatch(r"\(.*\)", s):
        negative, s = True, s[1:-1]
    s = re.sub(r"[A-Za-z$€£\s ]", "", s)
    if "-" in s:
        negative, s = True, s.replace("-", "")
    s = s.replace("+", "")
    if decimal_sep == ",":
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", "")
    try:
        value = Decimal(s)
    except InvalidOperation as exc:
        raise ValueError(f"Valor inválido: {raw!r}") from exc
    return -value if negative else value


def detect_decimal_separator(samples: list[str]) -> str:
    comma = dot = 0
    for raw in samples:
        s = re.sub(r"[^\d.,]", "", raw)
        last_comma, last_dot = s.rfind(","), s.rfind(".")
        if last_comma > last_dot and re.search(r",\d{1,2}$", s):
            comma += 1
        elif last_dot > last_comma and re.search(r"\.\d{1,2}$", s):
            dot += 1
    return "," if comma > dot else "."


def parse_date(raw: str) -> date:
    s = (raw or "").strip()
    if not s:
        raise ValueError("Data vazia")
    try:
        return _parse_date(s)
    except (ValueError, KeyError) as exc:
        raise ValueError(f"Data inválida: {raw!r}") from exc


def _parse_date(s: str) -> date:
    if m := re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", s):
        return date(int(m[1]), int(m[2]), int(m[3]))
    if m := re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b", s):
        year = int(m[3]) + (2000 if len(m[3]) == 2 else 0)
        return date(year, int(m[2]), int(m[1]))
    if m := re.search(r"([A-Za-zç]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})", s):
        return date(int(m[3]), _MONTHS[m[1][:3].lower()], int(m[2]))
    if m := re.search(r"(\d{1,2})\s+(?:de\s+)?([A-Za-zç]{3,})\.?\s+(?:de\s+)?(\d{4})", s):
        return date(int(m[3]), _MONTHS[m[2][:3].lower()], int(m[1]))
    raise ValueError(s)


def _to_date(cell: Cell) -> date:
    if isinstance(cell, datetime):
        return cell.date()
    if isinstance(cell, date):
        return cell
    return parse_date(_text(cell))


def _to_decimal(cell: Cell, decimal_sep: str) -> Decimal:
    if isinstance(cell, bool):
        raise ValueError(f"Valor inválido: {cell!r}")
    if isinstance(cell, int | float):
        return Decimal(str(cell))
    if isinstance(cell, Decimal):
        return cell
    return parse_amount(_text(cell), decimal_sep)


# ── helpers ──────────────────────────────────────────────────────────────────


def decode_text(data: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1")


def _detect_delimiter(text: str) -> str:
    lines = [ln for ln in text.splitlines() if ln.strip()][:15]
    counts = {d: sum(ln.count(d) for ln in lines) for d in (";", ",", "\t", "|")}
    return max(counts, key=lambda d: counts[d])


def _cell(cells: list[Cell], index: int | None) -> Cell:
    if index is None or index >= len(cells):
        return None
    return cells[index]


def _text(cell: Cell) -> str:
    if cell is None:
        return ""
    if isinstance(cell, datetime):
        return cell.date().isoformat()
    if isinstance(cell, date):
        return cell.isoformat()
    return str(cell).strip()
