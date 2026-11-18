import pytest

from app.statements.parsing.cards import (
    bill_month,
    installment,
    installment_in_text,
    pluggy_card_details,
)


@pytest.mark.parametrize(
    ("number", "total", "expected"),
    [(3, 10, "3/10"), ("1", "2", "1/2"), (1, 1, None), (0, 3, None), (4, 3, None), (None, 3, None)],
)
def test_installment(number: object, total: object, expected: str | None) -> None:
    assert installment(number, total) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Loja de Sofás - Parcela 3/10", "3/10"),
        ("MAGAZINE PARC 02/12", "2/12"),
        ("Parc. 1 / 3 Mercado", "1/3"),
        ("Padaria", None),
        ("Hotel 3/10", None),
    ],
)
def test_installment_in_text(text: str, expected: str | None) -> None:
    assert installment_in_text(text) == expected


def test_bill_month() -> None:
    assert bill_month("2026-12-05T00:00:00.000Z") == "2026-12"
    assert bill_month("2026-12-05") == "2026-12"
    assert bill_month("2026-13-01") is None
    assert bill_month(None) is None


def test_pluggy_card_details() -> None:
    tx = {
        "creditCardMetadata": {
            "billForecastDate": "2026-12-10",
            "installmentNumber": 3,
            "totalInstallments": 10,
        }
    }
    assert pluggy_card_details(tx) == ("2026-12", "3/10")
    assert pluggy_card_details({}) == (None, None)
