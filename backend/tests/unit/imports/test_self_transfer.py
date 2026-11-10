import pytest

from app.imports.services.self_transfer import looks_like_self_transfer

NAMES = ["Thiago Bomfim", "Ana"]


@pytest.mark.parametrize(
    "description",
    [
        "Transferência enviada pelo Pix - THIAGO BOMFIM DE SOUZA - 123.456",
        "Pix enviado: Thiago Bomfim",
        "Pix recebido: Thiago Souza Bomfim",
        "Payment from THIAGO BOMFIM",
        "TRANSFERENCIA A FAVOR DE BOMFIM THIAGO",
    ],
)
def test_pix_to_or_from_a_member(description: str) -> None:
    assert looks_like_self_transfer(description, NAMES)


@pytest.mark.parametrize(
    "description",
    [
        "Pix enviado: Thiago Silva",
        "Pix enviado: Ana Souza",  # a first name alone is not enough
        "Restaurante Thiago Bomfim",  # no money-move wording
        "Pix enviado: Fulano de Tal",
    ],
)
def test_other_people_and_purchases(description: str) -> None:
    assert not looks_like_self_transfer(description, NAMES)


def test_no_names() -> None:
    assert not looks_like_self_transfer("Pix enviado: Thiago Bomfim", [])
