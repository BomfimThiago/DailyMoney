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


def test_nubank_investment_is_marked_as_investment() -> None:
    st = read_statement("nubank.pdf", NUBANK)
    assert [r.kind for r in st.rows] == ["regular", "regular", "investment"]


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


class _FakePdf:
    def __init__(self, pages: list[object]) -> None:
        self.pages = pages
        self.closed = False

    def close(self) -> None:
        self.closed = True


class _BrokenPage:
    def __init__(self, error: Exception) -> None:
        self.error = error

    def extract_words(self, **_: object) -> list[dict[str, object]]:
        raise self.error


def _open_with(monkeypatch: pytest.MonkeyPatch, opened: object) -> None:
    import pdfplumber

    def fake_open(_: object) -> object:
        if isinstance(opened, Exception):
            raise opened
        return opened

    monkeypatch.setattr(pdfplumber, "open", fake_open)


@pytest.mark.parametrize(
    ("opened", "message"),
    [
        (Exception("Password is incorrect"), "O PDF tem senha"),
        (Exception("No /Root object"), "Ele pode estar corrompido"),
    ],
)
def test_pdf_that_does_not_open(
    monkeypatch: pytest.MonkeyPatch, opened: Exception, message: str
) -> None:
    _open_with(monkeypatch, opened)
    with pytest.raises(StatementError, match=message):
        pdf._text_lines(b"%PDF")


def test_pdf_without_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakePdf([])
    _open_with(monkeypatch, fake)
    with pytest.raises(StatementError, match="não tem páginas"):
        pdf._text_lines(b"%PDF")
    assert fake.closed


@pytest.mark.parametrize(
    ("error", "message"),
    [
        (Exception("Unexpected EOF"), "Não consegui ler o PDF"),
        (Exception("Encrypted stream"), "O PDF tem senha"),
        (Exception("password required"), "O PDF tem senha"),
    ],
)
def test_pdf_page_that_cannot_be_read(
    monkeypatch: pytest.MonkeyPatch, error: Exception, message: str
) -> None:
    fake = _FakePdf([_BrokenPage(error)])
    _open_with(monkeypatch, fake)
    with pytest.raises(StatementError, match=message):
        pdf._text_lines(b"%PDF")
    assert fake.closed


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
    assert [r.kind for r in st.rows] == ["regular", "investment", "regular", "regular"]


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


# ── Inter and Revolut (text PDFs) ────────────────────────────────────────────

INTER = make_pdf(
    [
        [
            (40, 76, "FULANO DE TAL"),
            (40, 93, "CPF/CNPJ: 000, Instituição: Banco Inter, Agência: 0001-9, Conta: 1234567-8"),
            (40, 137, "Saldo total"),
            (40, 147, "R$ 1,87"),
            (120, 147, "R$ 1,87"),
            (200, 147, "R$ 0,00"),
            (42, 197, "15 de Agosto de 2026 Saldo do dia: -R$ 199,43"),
            (435, 197, "Valor"),
            (479, 197, "Saldo por transação"),
            (44, 224, "IOF Global Account"),
            (420, 224, "-R$ 6,76"),
            (515, 224, "-R$ 6,19"),
            (44, 244, "Deposito Global Account"),
            (415, 244, "-R$ 193,24"),
            (510, 244, "-R$ 199,43"),
            (42, 273, "19 de Agosto de 2026 Saldo do dia: R$ 1.469,57"),
            (44, 298, 'Pix recebido: "Cp :12345678-Fulano de Tal"'),
            (410, 298, "R$ 1.669,00"),
            (510, 298, "R$ 1.469,57"),
            (38, 795, "SAC: 0800 940 9999"),
            (211, 795, "Ouvidoria: 0800 940 7772"),
            (385, 795, "Outro: 0800 979 7099"),
        ],
        [
            (42, 43, "20 de Agosto de 2026 Saldo do dia: R$ 25,09"),
            (44, 72, 'Pix enviado: "Cp :03816413-LOJA"'),
            (420, 72, "-R$ 44,48"),
            (515, 72, "R$ 25,09"),
        ],
    ]
)


def test_inter_pdf_reads_days_and_checks_daily_balance() -> None:
    st = read_statement("inter.pdf", INTER)
    assert (st.format, st.bank) == ("pdf", "Inter")
    assert [(r.date, r.amount, r.description, r.kind) for r in st.rows] == [
        (date(2026, 8, 15), Decimal("-6.76"), "IOF Global Account", "regular"),
        (date(2026, 8, 15), Decimal("-193.24"), "Deposito Global Account", "transfer"),
        (date(2026, 8, 19), Decimal("1669.00"), "Pix recebido: Fulano de Tal", "regular"),
    ]
    # 25,09 is not 1.469,57 − 44,48: that day stays out.
    assert [(e.row, e.raw[:10]) for e in st.errors] == [(4, "2026-08-20")]
    assert "20/08" in st.errors[0].message


def test_inter_pdf_without_entries_is_empty() -> None:
    data = make_pdf(
        [
            [
                (40, 60, "Instituição: Banco Inter, Agência: 0001-9, Conta: 1234567-8"),
                (
                    40,
                    80,
                    "Período: 01/10/2026 a 31/10/2026 Saldo do dia R$ 1.234.567,89 0123456789",
                ),
            ]
        ]
    )
    with pytest.raises(StatementError, match="nenhuma transação"):
        read_statement("inter.pdf", data)


def _revolut(summary_out: str, summary_in: str, currency: str = "EUR") -> bytes:
    header = [
        (43, 507, "Transaction"),
        (104, 514, "Value date"),
        (166, 514, "Description"),
        (335, 514, "Money out"),
        (417, 514, "Money in"),
        (526, 514, "Balance"),
    ]
    return make_pdf(
        [
            [
                (285, 70, f"Joint Account {currency} Statement"),
                (416, 104, "Revolut Bank UAB Sucursal En España"),
                (43, 354, "Product"),
                (253, 354, "Opening balance"),
                (335, 354, "Money out"),
                (417, 354, "Money in"),
                (43, 380, "Account (Current Account)"),
                (253, 380, "€100.00"),
                (335, 380, summary_out),
                (417, 380, summary_in),
                (535, 380, "€1,021.50"),
                (43, 478, "Account transactions from October 1, 2026 to October 31, 2026"),
                *header,
                (43, 539, "Oct 1, 2026"),
                (104, 539, "Oct 1, 2026"),
                (166, 539, "Ahorra Mas"),
                (335, 539, "€13.50"),
                (526, 539, "€86.50"),
                (166, 549, "To: Grupo Ahorramas 1377"),
                (166, 554, "Card: 416598******1234"),
                (43, 568, "Oct 2, 2026"),
                (104, 568, "Oct 2, 2026"),
                (166, 568, "Payment from FULANO DE"),
                (417, 568, "€1,000.00"),
                (519, 568, "€1,086.50"),
                (166, 578, "TAL"),
                (166, 588, "Reference: Pagos de la"),
                (166, 593, "casa"),
                (166, 600, "From: FULANO DE TAL, ES00"),
                (85, 735, "Report lost or stolen card"),
                (188, 741, "regulated by the Bank of Spain 2026 08130"),
            ],
            [
                *[(x, y - 365, t) for x, y, t in header],
                (43, 174, "Oct 3, 2026"),
                (104, 174, "Oct 3, 2026"),
                (166, 174, "To EUR SAVINGS"),
                (335, 174, "€65.00"),
                (526, 174, "€1,021.50"),
                (40, 388, "Deposit transactions from October 1, 2026 to October 31, 2026"),
                *[(x, y - 100, t) for x, y, t in header],
                (43, 449, "Oct 1, 2026"),
                (104, 449, "Oct 1, 2026"),
                (166, 449, "Net interest paid"),
                (417, 449, "€0.01"),
                (526, 449, "€443.92"),
            ],
        ]
    )


def test_revolut_pdf_reads_current_account_only() -> None:
    st = read_statement("revolut.pdf", _revolut("€78.50", "€1,000.00"))
    assert (st.format, st.bank, st.errors) == ("pdf", "Revolut", [])
    assert [(r.date, r.amount, r.currency, r.description, r.kind) for r in st.rows] == [
        (date(2026, 10, 1), Decimal("-13.50"), "EUR", "Ahorra Mas", "regular"),
        (
            date(2026, 10, 2),
            Decimal("1000.00"),
            "EUR",
            "Payment from FULANO DE TAL - Pagos de la casa",
            "regular",
        ),
        (date(2026, 10, 3), Decimal("-65.00"), "EUR", "To EUR SAVINGS", "investment"),
    ]


def test_revolut_pdf_totals_that_do_not_match_import_nothing() -> None:
    st = read_statement("revolut.pdf", _revolut("€78.50", "€999.00"))
    assert st.rows == []
    assert len(st.errors) == 3
    assert "resumo" in st.errors[0].message


def test_revolut_pdf_unsupported_currency() -> None:
    with pytest.raises(StatementError, match="Moeda"):
        read_statement("revolut.pdf", _revolut("€78.50", "€1,000.00", currency="GBP"))


def test_revolut_pdf_without_summary() -> None:
    data = make_pdf(
        [
            [
                (285, 70, "Account EUR Statement 2026 2026 2026 2026 2026 2026 2026"),
                (40, 90, "Revolut Bank UAB 0123456789"),
                (40, 110, "Account transactions from October 1, 2026 to October 31, 2026"),
            ]
        ]
    )
    with pytest.raises(StatementError, match="resumo de saldos"):
        read_statement("revolut.pdf", data)
