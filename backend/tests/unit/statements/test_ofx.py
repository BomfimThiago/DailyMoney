from datetime import date
from decimal import Decimal

import pytest

from app.statements.parsing.errors import StatementError
from app.statements.parsing.ofx import is_ofx, read_ofx

SGML = "\n".join(
    [
        "OFXHEADER:100",
        "DATA:OFXSGML",
        "<OFX>",
        "<SIGNONMSGSRSV1><SONRS><FI><ORG>NU PAGAMENTOS S.A.</FI></SONRS></SIGNONMSGSRSV1>",
        "<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL",
        "<BANKTRANLIST>",
        "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261008000000[-3:BRT]<TRNAMT>-29,21<FITID>id-1"
        "<MEMO>Pagamento de boleto efetuado - LOJA",
        "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261009<TRNAMT>0.62<FITID>id-2<NAME>Crédito em conta",
        "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
    ]
)


def test_reads_sgml_ofx() -> None:
    assert is_ofx(SGML.encode())
    st = read_ofx(SGML.encode())
    assert st.bank == "Nubank"
    assert st.errors == []
    assert [(r.date, r.amount, r.currency, r.description, r.external_id) for r in st.rows] == [
        (
            date(2026, 10, 8),
            Decimal("-29.21"),
            "BRL",
            "Pagamento de boleto efetuado - LOJA",
            "id-1",
        ),
        (date(2026, 10, 9), Decimal("0.62"), "BRL", "Crédito em conta", "id-2"),
    ]


def test_reads_xml_ofx_and_latin1() -> None:
    xml = SGML.replace("<TRNAMT>0.62", "<TRNAMT>0.62</TRNAMT>").replace(
        "Crédito em conta", "Crédito em conta</NAME>"
    )
    assert read_ofx(xml.encode("latin-1")).rows[1].description == "Crédito em conta"


def test_unreadable_transaction_is_an_error_others_stay() -> None:
    st = read_ofx(SGML.replace("<TRNAMT>0.62", "<TRNAMT>abc").encode())
    assert len(st.rows) == 1
    assert "Valor" in st.errors[0].message


def test_impossible_date_is_an_error() -> None:
    st = read_ofx(SGML.replace("20261009", "20260231").encode())
    assert "Data" in st.errors[0].message


def test_unsupported_currency() -> None:
    with pytest.raises(StatementError, match="Moeda"):
        read_ofx(SGML.replace("<CURDEF>BRL", "<CURDEF>GBP").encode())
