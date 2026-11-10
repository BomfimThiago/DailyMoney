"""One entry point for every statement file: picks the reader by content."""

from dataclasses import replace
from datetime import date, datetime
from io import BytesIO

from app.statements.parsing.errors import StatementError
from app.statements.parsing.ofx import is_ofx, read_ofx
from app.statements.parsing.own_moves import is_own_move
from app.statements.parsing.pdf import read_pdf
from app.statements.parsing.tabular import Cell, read_csv, read_grid
from app.statements.parsing.types import ParsedStatement

MAX_BYTES = 10 * 1024 * 1024


def read_statement(
    filename: str, data: bytes, default_currency: str | None = None
) -> ParsedStatement:
    statement = _read(filename, data, default_currency)
    statement.rows = [
        replace(r, is_transfer=True) if not r.is_transfer and is_own_move(r.description) else r
        for r in statement.rows
    ]
    return statement


def _read(filename: str, data: bytes, default_currency: str | None) -> ParsedStatement:
    if not data:
        raise StatementError("O arquivo está vazio.")
    if len(data) > MAX_BYTES:
        raise StatementError("O arquivo passa de 10 MB.")
    name = filename.lower()
    if data.startswith(b"%PDF"):
        return read_pdf(data)
    if is_ofx(data):
        return read_ofx(data)
    if data.startswith(b"PK\x03\x04"):
        return _read_xlsx(data, default_currency)
    if data.startswith(b"\xd0\xcf\x11\xe0"):
        raise StatementError("Planilha .xls antiga: salve como .xlsx ou .csv e envie de novo.")
    if b"\x00" in data[:4096] or name.endswith((".png", ".jpg", ".jpeg", ".heic")):
        raise StatementError("Não reconheci o formato. Envie CSV, OFX ou XLSX.")
    return read_csv(data, default_currency)


def _read_xlsx(data: bytes, default_currency: str | None) -> ParsedStatement:
    from openpyxl import load_workbook

    try:
        workbook = load_workbook(BytesIO(data), read_only=True, data_only=True)
    except Exception as exc:  # openpyxl raises many types for a corrupt zip
        raise StatementError("Não consegui abrir a planilha. Envie CSV, OFX ou XLSX.") from exc
    try:
        sheet = workbook.worksheets[0]
        grid: list[list[Cell]] = [
            [c if isinstance(c, str | int | float | date | datetime) else None for c in row]
            for row in sheet.iter_rows(values_only=True)
        ]
    finally:
        workbook.close()
    return read_grid(grid, default_currency=default_currency, fmt="xlsx", delimiter=";")
