import pytest

from app.statements.parsing.own_moves import own_move_kind, product_name


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
        "Inversiones",
        "Inversión fondo",
        'Debito Online Td: "Prot.1 IPCA+ 2032"',
        'Debito B3: "NOTA BOV 02/10/2026"',
        "Crédito B3: Falha De Entrega",
        "To EUR SAVINGS POCKET",
        "From EUR SAVINGS POCKET",
    ],
)
def test_investments(description: str) -> None:
    assert own_move_kind(description) == "investment"


@pytest.mark.parametrize(
    "description",
    ["TRASPASO PROPIO", "Deposito Global Account", "Depósito: Global Account"],
)
def test_own_account_transfers(description: str) -> None:
    assert own_move_kind(description) == "transfer"


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
    assert own_move_kind(description) is None


@pytest.mark.parametrize(
    ("description", "product"),
    [
        ("Aplicação RDB", "RDB"),
        ("Resgate RDB", "RDB"),
        ("APLICACAO CDB PRE", "CDB PRE"),
        ("Compra de ações - XYZ3", "XYZ3"),
        ('Debito Online Td: "Prot.1 IPCA+ 2032"', "Prot.1 IPCA+ 2032"),
        ("To EUR SAVINGS POCKET", "SAVINGS POCKET"),
        ("Tesouro Selic 2029", "Tesouro Selic 2029"),
        ("Inversiones", "Inversiones"),
    ],
)
def test_product_name(description: str, product: str) -> None:
    assert product_name(description) == product
