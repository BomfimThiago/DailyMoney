import pytest

from app.statements.parsing.own_moves import is_own_move


@pytest.mark.parametrize(
    "description",
    [
        "Aplicação RDB",
        "Resgate RDB",
        "APLICACAO CDB PRE",
        "Compra de ações - XYZ3",
        "Venda de Acoes",
        "Rendimento LCI",
        "Tesouro Selic 2029",
        "TRASPASO PROPIO",
        "Inversiones",
        "Inversión fondo",
    ],
)
def test_own_moves(description: str) -> None:
    assert is_own_move(description)


@pytest.mark.parametrize(
    "description",
    ["Compra no débito - MERCADO", "Pix enviado", "NOMINA", "Restaurante Aplicado", ""],
)
def test_not_own_moves(description: str) -> None:
    assert not is_own_move(description)
