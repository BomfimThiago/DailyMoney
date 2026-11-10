from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import httpx
import pytest

from app.connections.services import enablebanking, pluggy
from app.connections.services.connection_service import canonical_bank
from app.core.config import settings
from app.core.exceptions import ConflictError

SINCE = date(2026, 10, 1)


def eb(**over: Any) -> dict[str, Any]:
    tx = {
        "entry_reference": "ref-1",
        "transaction_amount": {"currency": "EUR", "amount": "10.50"},
        "credit_debit_indicator": "DBIT",
        "status": "BOOK",
        "booking_date": "2026-10-05",
        "creditor": {"name": "Mercadona"},
    }
    tx.update(over)
    return tx


def test_enable_banking_direction_reference_and_description() -> None:
    rows, errors = enablebanking.map_transactions(
        [
            eb(),
            eb(
                entry_reference=None,
                credit_debit_indicator="CRDT",
                debtor={"name": "ACME"},
                remittance_information=["Salary", "October"],
            ),
            eb(creditor=None, remittance_information=["Mercadona Madrid"]),
            eb(creditor={"name": "Lidl"}, remittance_information=["Compra LIDL 22"]),
            eb(status="PDNG"),
            eb(booking_date="2026-09-30"),
        ],
        "EUR",
        SINCE,
    )
    assert errors == []
    assert [(r.amount, r.description) for r in rows] == [
        (Decimal("-10.50"), "Mercadona"),
        (Decimal("10.50"), "ACME · Salary October"),
        (Decimal("-10.50"), "Mercadona Madrid"),
        (Decimal("-10.50"), "Compra LIDL 22"),
    ]
    assert rows[0].raw == "EB ref-1" and rows[0].external_id == "eb:ref-1"
    # No bank reference: the day, amount and text identify the line.
    assert rows[1].raw == "EB 2026-10-05|10.50|EUR|ACME · Salary October"
    assert rows[1].external_id is None


def test_enable_banking_unreadable_lines_are_reported() -> None:
    rows, errors = enablebanking.map_transactions(
        [
            eb(booking_date="ontem"),
            eb(transaction_amount={"currency": "EUR", "amount": "dez"}),
            eb(transaction_amount={"currency": "EUR", "amount": "NaN"}),
            eb(transaction_amount={"currency": "GBP", "amount": "1"}),
            eb(creditor=None),
        ],
        "EUR",
        SINCE,
    )
    assert rows == []
    assert [e.message for e in errors] == [
        "Data ilegível: ontem",
        "Valor ilegível: dez",
        "Valor ilegível: NaN",
        "Moeda não suportada: GBP",
        "Transação sem descrição",
    ]


def test_enable_banking_account_identity() -> None:
    assert enablebanking.account_key({"uid": "u", "identification_hash": "h"}) == "h"
    by_iban = enablebanking.account_key({"uid": "u", "account_id": {"iban": "es12 3456"}})
    assert by_iban == enablebanking.account_key({"uid": "x", "account_id": {"iban": "ES123456"}})
    other = {"uid": "u", "account_id": {"other": {"identification": "99"}}}
    assert len(enablebanking.account_key(other)) == 64
    assert enablebanking.account_key({"uid": "u"}) == "uid:u"
    assert enablebanking.account_last4({"account_id": {"iban": "ES12 3456 7890"}}) == "7890"
    assert enablebanking.account_last4({}) is None


def test_enable_banking_errors_say_what_to_do() -> None:
    expired = enablebanking._error(httpx.Response(401, json={"error": "EXPIRED_SESSION"}))
    assert isinstance(expired, ConflictError)
    other = enablebanking._error(httpx.Response(500, text="boom"))
    assert other.detail == "A Enable Banking respondeu 500: boom"


def test_private_key_in_base64(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ENABLE_BANKING_PRIVATE_KEY", "aGVsbG8=")
    assert enablebanking._private_key() == "hello"


def test_canonical_bank_names() -> None:
    assert canonical_bank("Wise Europe") == "Wise"
    assert canonical_bank("CaixaBank") == "CaixaBank"
    assert canonical_bank("ING") == "ING"


def pl(**over: Any) -> dict[str, Any]:
    tx = {
        "id": "t1",
        "date": "2026-10-05T15:00:00.000Z",
        "description": "Padaria",
        "amount": -12.5,
        "currencyCode": "BRL",
    }
    tx.update(over)
    return tx


def test_pluggy_kinds() -> None:
    rows, errors = pluggy.map_transactions(
        "BRL",
        False,
        [
            pl(),
            pl(description="Pagamento de fatura", amount=-300),
            pl(description="Fatura de luz", amount=-90),
            pl(description="Depósito - Global Account", amount=-500),
            pl(operationType="TRANSFERENCIA_MESMA_TITULARIDADE", description="Pix"),
            pl(operationType="APLICACAO_FINANCEIRA", description="Algo"),
            pl(category="Proceeds interests and dividends", description="Débito B3 Compra ITUB"),
            pl(category="Proceeds interests and dividends", description="Dividendos"),
        ],
        SINCE,
    )
    assert errors == []
    assert [r.kind for r in rows] == [
        "regular",
        "transfer",
        "regular",
        "transfer",
        "transfer",
        "investment",
        "investment",
        "regular",
    ]


def test_pluggy_unreadable_and_foreign_lines() -> None:
    rows, errors = pluggy.map_transactions(
        "BRL",
        False,
        [
            pl(date="ontem"),
            pl(currencyCode="GBP"),
            pl(description="  "),
            pl(currencyCode="USD", amount=-3),
            pl(date="2026-09-01T12:00:00Z"),
        ],
        SINCE,
    )
    assert [e.message for e in errors] == [
        "Data ilegível",
        "Moeda não suportada: GBP",
        "Transação sem descrição",
    ]
    assert [(r.amount, r.currency) for r in rows] == [(Decimal("-3.00"), "USD")]


def test_pluggy_item_checks() -> None:
    now = datetime(2026, 11, 10, tzinfo=UTC)
    until = pluggy.check_item(
        {"status": "UPDATED", "consentExpiresAt": "2027-01-01T00:00:00Z"}, now
    )
    assert until == datetime(2027, 1, 1, tzinfo=UTC)
    with pytest.raises(ConflictError, match="venceu"):
        pluggy.check_item({"consentExpiresAt": "2026-01-01T00:00:00Z"}, now)
    with pytest.raises(ConflictError, match="LOGIN_ERROR"):
        pluggy.check_item({"status": "LOGIN_ERROR"}, now)
    assert pluggy.bank_name({"connector": {"name": "Banco Inter"}}) == "Inter"
    assert pluggy.bank_name({"connector": {"name": "C6"}}) == "C6"
    assert pluggy.bank_name({}) == "Banco"
