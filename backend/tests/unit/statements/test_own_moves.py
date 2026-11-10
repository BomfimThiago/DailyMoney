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
        "Deposito Global Account",
        "Depósito: Global Account",
        'Debito Online Td: "Prot.1 IPCA+ 2032"',
        'Debito B3: "NOTA BOV 02/10/2026"',
        "Crédito B3: Falha De Entrega",
        "To EUR SAVINGS POCKET",
        "From EUR SAVINGS POCKET",
    ],
)
def test_own_moves(description: str) -> None:
    assert is_own_move(description)


@pytest.mark.parametrize(
    "description",
    [
        "Compra no débito - MERCADO",
        "Pix enviado",
        "NOMINA",
        "Restaurante Aplicado",
        "",
        "IOF Global Account",
        "Credito B3 Btb: Nota de Aluguel",
        "Credito Evento B3: RENDIMENTO",
        "Transfer to Fulano",
        "To Tamise Asesoria SL",
    ],
)
def test_not_own_moves(description: str) -> None:
    assert not is_own_move(description)
