from io import BytesIO

import pytest
from openpyxl import Workbook

from app.statements.parsing.errors import StatementError
from app.statements.parsing.reader import read_statement


def _xlsx(rows: list[list[object]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    for row in rows:
        ws.append(row)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_dispatches_csv_and_ofx() -> None:
    assert (
        read_statement(
            "extrato.csv",
            b"Data,Valor,Identificador,Descri\xc3\xa7\xc3\xa3o\n01/10/2026,1.00,a,Pix\n",
        ).format
        == "csv"
    )
    ofx = b"<OFX><CURDEF>EUR<STMTTRN><DTPOSTED>20261001<TRNAMT>-1.00<NAME>x</STMTTRN></OFX>"
    assert read_statement("export.qfx", ofx).format == "ofx"
    # content wins over a misleading extension
    assert read_statement("extrato.txt", ofx).format == "ofx"


def test_reads_xlsx_with_real_dates_and_numbers() -> None:
    from datetime import date
    from decimal import Decimal

    data = _xlsx(
        [
            ["Movimientos de la cuenta"],
            [],
            ["Fecha", "Fecha valor", "Movimiento", "Más datos", "Importe", "Saldo"],
            [date(2026, 10, 3), date(2026, 10, 3), "COMPRA MERCADONA", "", -45.2, 954.8],
            ["04/10/2026", "04/10/2026", "BIZUM RECIBIDO", "Ana", "20,00", "974,80"],
        ]
    )
    st = read_statement("movimientos.xlsx", data, default_currency="EUR")
    assert st.format == "xlsx"
    assert st.errors == []
    assert [(r.date, r.amount, r.description) for r in st.rows] == [
        (date(2026, 10, 3), Decimal("-45.20"), "COMPRA MERCADONA"),
        (date(2026, 10, 4), Decimal("20.00"), "BIZUM RECIBIDO"),
    ]


def test_unknown_binary_is_rejected() -> None:
    with pytest.raises(StatementError, match="formato"):
        read_statement("foto.png", b"\x89PNG\r\n\x1a\n\x00\x00")


def test_empty_file() -> None:
    with pytest.raises(StatementError, match="vazio"):
        read_statement("x.csv", b"")
