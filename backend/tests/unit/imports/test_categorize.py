from decimal import Decimal

from app.categories.services.categorize import Categorizer, merchant_key


def test_merchant_key_drops_numbers_accents_and_noise() -> None:
    assert merchant_key("GRUPO AHORRAMAS 24") == merchant_key("Grupo Ahorramás 1")
    assert merchant_key("Uber *Trip HELP.UBER.COM") == "uber trip help"


def test_merchant_key_skips_the_bank_wording_before_the_merchant() -> None:
    # Otherwise every debit purchase would share one key, and one category rule.
    assert merchant_key("Compra no débito - MERCADONA") == "mercadona"
    assert merchant_key("Pix enviado - Fulano de Tal") == "fulano de tal"
    assert merchant_key("Transferência enviada pelo Pix - ANA SILVA - 123") == "ana silva"
    assert merchant_key("Pagamento de boleto efetuado - LOJA X") == "loja x"
    assert merchant_key("Payment from FULANO - Pagos") == "payment from fulano"


def test_family_rule_wins_over_keywords() -> None:
    c = Categorizer(rules={merchant_key("UBER TRIP"): "Lazer"})
    assert c.category_for("Uber Trip", Decimal("-10")) == "Lazer"


def test_keyword_suggestions() -> None:
    c = Categorizer(rules={})
    assert c.category_for("BOLT.EU/O/2610", Decimal("-8")) == "Transporte"
    assert c.category_for("MERCADONA MADRID", Decimal("-45")) == "Mercado"
    assert c.category_for("NETFLIX.COM", Decimal("-12.99")) == "Assinaturas"
    assert c.category_for("iFood *Restaurante", Decimal("-60")) == "Restaurantes"


def test_fallbacks_by_sign_and_transfer() -> None:
    c = Categorizer(rules={})
    assert c.category_for("Coisa estranha", Decimal("-5")) == "Outros"
    assert c.category_for("Coisa estranha", Decimal("5")) == "Renda"
    assert c.category_for("Mercadona", Decimal("-5"), is_transfer=True) == "Transferência"
