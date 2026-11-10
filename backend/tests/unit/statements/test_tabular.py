from datetime import date
from decimal import Decimal

import pytest

from app.statements.parsing.errors import StatementError
from app.statements.parsing.tabular import (
    detect_decimal_separator,
    parse_amount,
    parse_date,
    read_csv,
    read_grid,
)

NUBANK = (
    "Data,Valor,Identificador,Descrição\n"
    "01/10/2026,0.10,aaa-1,Crédito em conta\n"
    "08/10/2026,-29.21,aaa-2,Pagamento de boleto efetuado - LOJA\n"
)

NUBANK_CARD = (
    "date,title,amount\n2026-10-03,Uber *Trip,23.90\n2026-10-10,Pagamento recebido,-500.00\n"
)

REVOLUT = (
    "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n"
    "CARD_PAYMENT,Current,2026-10-02 10:11:12,2026-10-03 09:00:00,Mercadona,-45.20,0.00,EUR,"
    "COMPLETED,954.80\n"
    "TOPUP,Current,2026-10-01 08:00:00,2026-10-01 08:00:01,Top-up by *1234,1000.00,0.00,EUR,"
    "COMPLETED,1000.00\n"
)

WISE_HEADER = (
    '"TransferWise ID",Date,"Date Time",Amount,Currency,Description,"Payment Reference",'
    '"Running Balance","Exchange From","Exchange To","Exchange Rate","Payer Name","Payee Name",'
    '"Payee Account Number",Merchant,"Card Last Four Digits","Card Holder Full Name",Attachment,'
    'Note,"Total fees","Exchange To Amount","Transaction Type","Transaction Details Type"'
)
WISE = "\n".join(
    [
        WISE_HEADER,
        'BALANCE-1,02-11-2026,"02-11-2026 16:01:01.163",-5257.14,USD,"Converted 5,257.14 USD to '
        '28,332.56 BRL",,0.00,USD,BRL,5.43785,,,,,,,,,46.89,28332.56,DEBIT,CONVERSION',
        'CARD-3,01-11-2026,"01-11-2026 09:00:00.000",-12.30,USD,"Card transaction of 12.30 USD '
        'issued by Cafe",,0.00,,,,,,,Cafe,1234,,,,0.00,,DEBIT,CARD',
        "",
    ]
)


def test_nubank_account_csv_is_recognised_and_in_reais() -> None:
    st = read_csv(NUBANK.encode())
    assert st.bank == "Nubank"
    assert st.errors == []
    assert [(r.date, r.amount, r.currency) for r in st.rows] == [
        (date(2026, 10, 1), Decimal("0.10"), "BRL"),
        (date(2026, 10, 8), Decimal("-29.21"), "BRL"),
    ]
    assert st.rows[1].description == "Pagamento de boleto efetuado - LOJA"
    assert st.rows[0].external_id == "aaa-1"


def test_nubank_card_csv_flips_sign_so_purchases_are_negative() -> None:
    st = read_csv(NUBANK_CARD.encode())
    assert st.bank == "Nubank"
    assert st.is_card
    assert [r.amount for r in st.rows] == [Decimal("-23.90"), Decimal("500.00")]


def test_revolut_uses_currency_column_and_first_date() -> None:
    st = read_csv(REVOLUT.encode())
    assert st.bank == "Revolut"
    assert [(r.date, r.amount, r.currency) for r in st.rows] == [
        (date(2026, 10, 2), Decimal("-45.20"), "EUR"),
        (date(2026, 10, 1), Decimal("1000.00"), "EUR"),
    ]


def test_wise_conversion_is_marked_as_transfer() -> None:
    st = read_csv(WISE.encode())
    assert st.bank == "Wise"
    assert [r.is_transfer for r in st.rows] == [True, False]
    assert [r.currency for r in st.rows] == ["USD", "USD"]
    assert st.rows[0].external_id == "BALANCE-1"


def test_generic_spanish_csv_with_comma_decimals_and_preamble() -> None:
    text = (
        "Extracto de cuenta;;;\n"
        "Titular;Thiago;;\n"
        ";;;\n"
        "Fecha;Concepto;Importe;Saldo\n"
        "03/10/2026;COMPRA TARJ. LIDL MADRID;-1.234,56 EUR;8.000,00\n"
        "04/10/2026;NOMINA ACME;2.500,00 EUR;10.500,00\n"
    )
    st = read_csv(text.encode("latin-1"))
    assert st.bank is None
    assert [(r.date, r.amount, r.currency, r.description) for r in st.rows] == [
        (date(2026, 10, 3), Decimal("-1234.56"), "EUR", "COMPRA TARJ. LIDL MADRID"),
        (date(2026, 10, 4), Decimal("2500.00"), "EUR", "NOMINA ACME"),
    ]


def test_description_falls_back_to_most_textual_column() -> None:
    grid: list[list[object]] = [
        ["Fecha", "Fecha valor", "Movimiento", "Más datos", "Importe", "Saldo"],
        ["03/10/2026", "03/10/2026", "BIZUM ENVIADO", "Pago cena", "-20,00", "100,00"],
    ]
    st = read_grid(grid, default_currency="EUR")
    assert st.rows[0].description == "BIZUM ENVIADO"


def test_file_without_currency_and_unknown_bank_needs_default() -> None:
    grid: list[list[object]] = [["Data", "Descrição", "Valor"], ["01/10/2026", "Padaria", "-12,00"]]
    st = read_grid(grid)
    assert st.rows == []
    assert "moeda" in st.errors[0].message
    assert read_grid(grid, default_currency="BRL").rows[0].currency == "BRL"


def test_bad_row_becomes_error_and_others_stay() -> None:
    st = read_csv(NUBANK.replace("0.10", "abc").encode())
    assert len(st.rows) == 1
    assert st.errors[0].row == 1
    assert "Valor" in st.errors[0].message


def test_header_only_file_says_there_is_nothing() -> None:
    with pytest.raises(StatementError, match="nenhuma transação"):
        read_csv(b"Data,Valor,Identificador,Descri\xc3\xa7\xc3\xa3o\n")


def test_unrecognised_layout_is_an_error() -> None:
    with pytest.raises(StatementError, match="colunas"):
        read_csv(b"foo,bar\n1,2\n")


@pytest.mark.parametrize(
    ("raw", "sep", "expected"),
    [
        ("1.234,56", ",", "1234.56"),
        ("1,234.56", ".", "1234.56"),
        ("-88,56EUR", ",", "-88.56"),
        ("R$ 412,90", ",", "412.90"),
        ("(12,00)", ",", "-12.00"),
        ("12,00-", ",", "-12.00"),
        ("−3,20", ",", "-3.20"),
    ],
)
def test_parse_amount(raw: str, sep: str, expected: str) -> None:
    assert parse_amount(raw, sep) == Decimal(expected)


def test_parse_amount_rejects_garbage() -> None:
    with pytest.raises(ValueError):
        parse_amount("abc", ".")


def test_detect_decimal_separator() -> None:
    assert detect_decimal_separator(["1.234,56", "-12,00"]) == ","
    assert detect_decimal_separator(["-5257.14", "12.30"]) == "."


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2026-08-06", date(2026, 8, 6)),
        ("2026-08-06 16:14:02", date(2026, 8, 6)),
        ("06/08/2026", date(2026, 8, 6)),
        ("06-08-2026", date(2026, 8, 6)),
        ("06.08.26", date(2026, 8, 6)),
        ("6 ago 2026", date(2026, 8, 6)),
        ("Aug 6, 2026", date(2026, 8, 6)),
    ],
)
def test_parse_date(raw: str, expected: date) -> None:
    assert parse_date(raw) == expected


@pytest.mark.parametrize("raw", ["31/02/2026", "99/99/2026", "", "ontem"])
def test_impossible_dates_are_errors(raw: str) -> None:
    with pytest.raises(ValueError):
        parse_date(raw)
