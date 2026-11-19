"""Which card an unpaired bill payment went to: one the app reads, or not."""

from app.transactions.services.card_payments import paid_card_in_app

CARDS = ["Nubank", "Itaú", "Banco Santander Pessoa Física"]


def test_a_payment_with_no_name_is_the_paying_banks_own_card() -> None:
    assert paid_card_in_app("Pagamento de fatura", "Nubank", CARDS) is True


def test_no_card_of_the_paying_bank_means_not_in_the_app() -> None:
    assert paid_card_in_app("Pagamento de fatura", "Inter", CARDS) is False


def test_a_payment_naming_another_card_in_the_app_is_in_the_app() -> None:
    assert paid_card_in_app("Pagamento efetuado|SANTANDER ELITE VISA", "Nubank", CARDS) is True
    assert paid_card_in_app("Pix|ITAÚ UNIBANCO HOLDING S A", "Inter", CARDS) is True


def test_a_payment_naming_a_card_the_app_does_not_read_counts() -> None:
    # The paying bank has its own card in the app, but this paid a store card.
    assert paid_card_in_app("Pagamento efetuado|MIDWAY", "Nubank", CARDS) is False


def test_a_pix_to_a_person_is_not_a_card_in_the_app() -> None:
    description = "Transferência enviada pelo Pix|Vitor Alessandro da Silva"
    assert paid_card_in_app(description, "Nubank", CARDS) is False


def test_a_payee_that_is_the_paying_bank_is_its_own_card() -> None:
    assert paid_card_in_app("Pagamento|NUBANK", "Nubank", CARDS) is True
