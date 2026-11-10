"""PDF statements. Every PDF here is synthetic; real statements carry personal data."""

import shutil
from datetime import date
from decimal import Decimal

import pytest

from app.statements.parsing import pdf
from app.statements.parsing.errors import StatementError
from app.statements.parsing.pdf_banks import CaixaBankOcr
from app.statements.parsing.reader import read_statement
from tests.unit.statements.pdf_maker import make_pdf

NUBANK = make_pdf(
    [
        [
            (40, 60, "Extrato da conta Nubank"),
            (40, 120, "Movimentações"),
            (40, 150, "01 OUT 2026"),
            (130, 150, "Total de entradas"),
            (500, 150, "+ 1.500,00"),
            (130, 165, "Transferência recebida pelo Pix"),
            (510, 165, "1.500,00"),
            (220, 178, "FULANO DE TAL - 123.456"),
            (130, 195, "Total de saídas"),
            (500, 195, "- 85,40"),
            (130, 210, "Compra no débito"),
            (520, 210, "45,40"),
            (220, 222, "MERCADO EXEMPLO"),
            (130, 237, "Aplicação RDB"),
            (520, 237, "40,00"),
            (40, 300, "Tem alguma dúvida? Fale com a gente"),
        ],
        [
            (40, 60, "VALORES EM R$"),
            (40, 90, "03 OUT 2026"),
            (130, 90, "Total de saídas"),
            (500, 90, "- 10,00"),
            (130, 105, "Pagamento de boleto"),
            (520, 105, "12,00"),
            (40, 200, "O saldo líquido corresponde a 2026"),
        ],
    ]
)

ITAU = make_pdf(
    [
        [
            (40, 60, "Itaú Unibanco - extrato de conta 2026"),
            (40, 100, "data"),
            (120, 100, "lançamentos"),
            (380, 100, "valor (R$)"),
            (480, 100, "saldo (R$)"),
            (40, 120, "01/10/2026"),
            (120, 120, "SALDO ANTERIOR"),
            (500, 120, "1.000,00"),
            (40, 135, "02/10/2026"),
            (120, 135, "PIX TRANSF FULANO"),
            (400, 135, "650,00"),
            (40, 150, "03/10/2026"),
            (120, 150, "FATURA PAGA CARTAO"),
            (395, 150, "-643,71"),
            (500, 150, "1.006,29"),
            (40, 165, "04/10/2026"),
            (120, 165, "AVISO SEM VALOR"),
            (300, 165, "ref 123"),
        ]
    ]
)


def test_nubank_pdf_signs_come_from_sections() -> None:
    st = read_statement("nubank.pdf", NUBANK)
    assert (st.format, st.bank) == ("pdf", "Nubank")
    assert [(r.date, r.amount, r.description, r.currency) for r in st.rows] == [
        (
            date(2026, 10, 1),
            Decimal("1500.00"),
            "Transferência recebida pelo Pix - FULANO DE TAL - 123.456",
            "BRL",
        ),
        (date(2026, 10, 1), Decimal("-45.40"), "Compra no débito - MERCADO EXEMPLO", "BRL"),
        (date(2026, 10, 1), Decimal("-40.00"), "Aplicação RDB", "BRL"),
    ]


def test_nubank_investment_is_marked_as_transfer() -> None:
    st = read_statement("nubank.pdf", NUBANK)
    assert [r.is_transfer for r in st.rows] == [False, False, True]


def test_nubank_day_that_does_not_add_up_is_not_imported() -> None:
    st = read_statement("nubank.pdf", NUBANK)
    assert len(st.errors) == 1
    assert "03/10" in st.errors[0].message
    assert "Pagamento de boleto" in st.errors[0].raw


def test_itau_pdf_reads_value_column_and_skips_balances() -> None:
    st = read_statement("itau.pdf", ITAU)
    assert (st.format, st.bank) == ("pdf", "Itaú")
    assert [(r.date, r.amount, r.description) for r in st.rows] == [
        (date(2026, 10, 2), Decimal("650.00"), "PIX TRANSF FULANO"),
        (date(2026, 10, 3), Decimal("-643.71"), "FATURA PAGA CARTAO"),
    ]
    assert [e.message for e in st.errors] == ["Linha sem valor"]


def test_itau_without_column_header_is_rejected() -> None:
    data = make_pdf(
        [[(40, 60, "Itaú lançamentos 01/10/2026 02/10/2026 03/10/2026 04/10/2026 05/10/2026")]]
    )
    with pytest.raises(StatementError, match="colunas do extrato do Itaú"):
        read_statement("itau.pdf", data)


def test_nubank_without_movements_is_empty() -> None:
    data = make_pdf(
        [
            [
                (40, 60, "Nubank 01/10/2026 a 31/10/2026 saldo 1.234,56 conta 123456-7"),
                (40, 80, "Movimentações"),
                (40, 100, "Total de entradas 0,00 Total de saídas 0,00 2026 2026"),
            ]
        ]
    )
    with pytest.raises(StatementError, match="nenhuma transação"):
        read_statement("nubank.pdf", data)


def test_unknown_text_pdf_asks_for_another_format() -> None:
    data = make_pdf(
        [[(40, 60, "Banco Desconhecido 01/10/2026 123,45 02/10/2026 678,90 0123456789 9876543210")]]
    )
    with pytest.raises(StatementError, match="Ainda não sei ler o PDF"):
        read_statement("x.pdf", data)


def test_corrupt_pdf() -> None:
    with pytest.raises(StatementError, match="PDF"):
        read_statement("x.pdf", b"%PDF-1.7 ...")


def test_page_lines_group_words_into_lines_and_segments() -> None:
    words: list[dict[str, object]] = [
        {"text": "Total", "x0": 120.0, "x1": 140.0, "top": 100.0},
        {"text": "10,00", "x0": 500.0, "x1": 520.0, "top": 101.5},
        {"text": "de", "x0": 143.0, "x1": 150.0, "top": 100.2},
        {"text": "Outra", "x0": 40.0, "x1": 60.0, "top": 120.0},
    ]
    lines = pdf._page_lines(2, words)
    assert [(line.page, line.text) for line in lines] == [(2, "Total de 10,00"), (2, "Outra")]
    assert [s.text for s in lines[0].segments] == ["Total de", "10,00"]


# ── Scanned PDFs (OCR) ───────────────────────────────────────────────────────

HEADER = "CaixaBank\nTitular: Fulano\nConcepto Fecha Importe Saldo\n"
PASS_1 = HEADER + (
    "CAFE EXEMPLO 04/11/2026 14.5 251,18€\n"  # minus sign lost
    "Inversiones 04/11/2026 -400.0 265,63€\n"  # balance misread
    "2/3\n"
    "NOMINA 03/11/2026 400.0 665,68€\n"
    "CAJERO 02/11/2026 -50.0 265,68€\n"
)
PASS_2 = HEADER + (
    "CAFE EXEMPLO 04/11/2026 -14.5 251,18€\n"
    "Inversiones 04/11/2026 -400.0 265,68€\n"
    "NOMINA 03/11/2026 400.0 665,68€\n"
    "CAJERO 02/11/2026 -50.0 265,68€\n"
)


def test_caixabank_ocr_combines_passes_and_takes_sign_from_balance() -> None:
    st = CaixaBankOcr().read([PASS_1, PASS_2])
    assert (st.format, st.bank) == ("pdf", "CaixaBank")
    assert st.errors == []
    assert [(r.date, r.amount, r.description, r.currency) for r in st.rows] == [
        (date(2026, 11, 4), Decimal("-14.5"), "CAFE EXEMPLO", "EUR"),
        (date(2026, 11, 4), Decimal("-400.0"), "Inversiones", "EUR"),
        (date(2026, 11, 3), Decimal("400.0"), "NOMINA", "EUR"),
        (date(2026, 11, 2), Decimal("-50.0"), "CAJERO", "EUR"),
    ]


def test_caixabank_row_no_reading_confirms_is_not_imported() -> None:
    st = CaixaBankOcr().read([PASS_1])
    # Only the misread balance of row 2 is available: rows 1 and 2 can't be confirmed.
    assert [e.row for e in st.errors] == [1, 2]
    assert {e.message for e in st.errors} == {"O valor lido não confere com o saldo"}
    assert [r.description for r in st.rows] == ["NOMINA", "CAJERO"]


def test_caixabank_unreadable_line_and_misaligned_pass() -> None:
    garbled = HEADER + (
        "CAFE EXEMPLO 04/11/2026 -14.5 251,18€\n"
        "Pson dal haha 810/2076 2350 0 667 54€\n"
        "NOMINA 03/11/2026 400.0 665,68€\n"
    )
    shorter = HEADER + "CAFE EXEMPLO 04/11/2026 -14.5 251,18€\n"
    st = CaixaBankOcr().read([garbled, shorter])
    assert [(e.row, e.message) for e in st.errors] == [
        (1, "Não consegui conferir o valor pelo saldo"),
        (2, "Não consegui ler esta linha"),
    ]
    assert [(r.description, r.amount) for r in st.rows] == [("NOMINA", Decimal("400.0"))]


def test_caixabank_without_header_is_rejected() -> None:
    with pytest.raises(StatementError, match="colunas do extrato da CaixaBank"):
        CaixaBankOcr().read(["CaixaBank\nnada aqui\n"])


def test_caixabank_header_without_rows_is_empty() -> None:
    with pytest.raises(StatementError, match="nenhuma transação"):
        CaixaBankOcr().read([HEADER])


def test_caixabank_invalid_date_is_unreadable() -> None:
    st = CaixaBankOcr().read([HEADER + "CAFE 32/13/2026 -1.0 1,00€\nNOMINA 03/11/2026 2.0 2,00€\n"])
    assert [(e.row, e.message) for e in st.errors] == [(1, "Não consegui ler esta linha")]


SCANNED = make_pdf([[(40, 40, "1/3")]])


def test_scanned_pdf_goes_through_ocr_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[int, bool]] = []

    def fake_ocr(data: bytes, scale: int, grayscale: bool) -> str:
        calls.append((scale, grayscale))
        return PASS_2

    monkeypatch.setattr(pdf, "_ocr", fake_ocr)
    st = read_statement("caixa.pdf", SCANNED)
    assert calls == list(pdf._OCR_PASSES)
    assert st.bank == "CaixaBank"
    assert [r.is_transfer for r in st.rows] == [False, True, False, False]


def test_scanned_pdf_from_unknown_bank(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pdf, "_ocr", lambda data, scale, gray: "Banco X 01/10/2026 10,00")
    with pytest.raises(StatementError, match="não reconheci o banco"):
        read_statement("x.pdf", SCANNED)


def test_scanned_pdf_without_tesseract(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(shutil, "which", lambda name: None)
    with pytest.raises(StatementError, match="leitor de imagens não está instalado"):
        read_statement("x.pdf", SCANNED)


@pytest.mark.skipif(shutil.which("tesseract") is None, reason="tesseract not installed")
def test_ocr_reads_rendered_page() -> None:
    data = make_pdf([[(40, 60, "Concepto Fecha Importe Saldo"), (40, 80, "NOMINA 03/11/2026")]])
    text = pdf._ocr(data, 3, True)
    assert "Concepto" in text
    assert "03/11/2026" in text


@pytest.mark.skipif(shutil.which("tesseract") is None, reason="tesseract not installed")
def test_ocr_of_blank_page() -> None:
    with pytest.raises(StatementError, match="texto legível"):
        pdf._ocr(make_pdf([[]]), 1, True)
