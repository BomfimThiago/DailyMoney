"""Category for each new transaction (spec: "Como a categoria é escolhida").

In order: the family's own rule for that merchant, then a suggestion from the merchant
name, then Outros (or Renda for money coming in). Bank-sent categories come in with
the bank connections.
"""

import re
import unicodedata
from decimal import Decimal

TRANSFER = "Transferência"
INCOME = "Renda"
OTHER = "Outros"

DEFAULT_CATEGORIES: list[tuple[str, str, str]] = [
    # name, kind, color
    ("Moradia", "expense", "#8a7fb8"),
    ("Mercado", "expense", "#5f8f7b"),
    ("Restaurantes", "expense", "#c7795a"),
    ("Transporte", "expense", "#6f8fb8"),
    ("Lazer", "expense", "#b86f8f"),
    ("Saúde", "expense", "#c75a5a"),
    ("Assinaturas", "expense", "#4f9a9a"),
    (OTHER, "expense", "#9a98a6"),
    (INCOME, "income", "#5f9f6b"),
    (TRANSFER, "transfer", "#8a8799"),
]

_KEYWORDS: list[tuple[str, re.Pattern[str]]] = [
    (
        "Transporte",
        re.compile(
            r"\b(uber|bolt|cabify|99app|99 pop|freenow|free now|metro|renfe|emt|blablacar"
            r"|posto|shell|repsol|cepsa|galp|ipiranga|combustivel|gasolina|estacionamento"
            r"|parking|ryanair|iberia|latam|gol linhas|azul linhas|vueling)\b"
        ),
    ),
    (
        "Mercado",
        re.compile(
            r"\b(mercadona|carrefour|lidl|aldi|ahorramas|alcampo|eroski|hipercor"
            r"|supermercado|supermerc|pao de acucar|assai|atacadao|hortifruti)\b"
        ),
    ),
    (
        "Restaurantes",
        re.compile(
            r"\b(ifood|glovo|just eat|uber eats|deliveroo|rappi|restaurante|restaurant"
            r"|cafe|cafeteria|padaria|pizzaria|burger|mcdonalds|starbucks|telepizza)\b"
        ),
    ),
    (
        "Assinaturas",
        re.compile(
            r"\b(netflix|spotify|disney|hbo|prime video|amazon prime|apple com|icloud"
            r"|google one|youtube|chatgpt|openai|claude|anthropic|dropbox|adobe|patreon)\b"
        ),
    ),
    (
        "Saúde",
        re.compile(
            r"\b(farmacia|drogaria|droga raia|drogasil|pague menos|hospital|clinica"
            r"|dentista|laboratorio|sanitas|adeslas|unimed|amil)\b"
        ),
    ),
    (
        "Moradia",
        re.compile(
            r"\b(aluguel|alquiler|condominio|comunidad|iberdrola|endesa|naturgy|enel"
            r"|sabesp|canal de isabel|copel|cemig|vodafone|movistar|digi"
            r"|ikea|leroy merlin)\b"
        ),
    ),
    ("Lazer", re.compile(r"\b(cinema|cine|teatro|ingresso|entradas|steam|playstation)\b")),
]


def _plain(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[0-9]+", " ", text)
    text = re.sub(r"[^a-z\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def merchant_key(description: str) -> str:
    """'GRUPO AHORRAMAS 24' and 'Grupo Ahorramás 1' → 'grupo ahorramas'."""
    return " ".join(_plain(description).split(" ")[:3])


class Categorizer:
    def __init__(self, rules: dict[str, str]) -> None:
        self.rules = rules

    def category_for(self, description: str, amount: Decimal, is_transfer: bool = False) -> str:
        if is_transfer:
            return TRANSFER
        rule = self.rules.get(merchant_key(description))
        if rule:
            return rule
        plain = _plain(description)
        for name, pattern in _KEYWORDS:
            if pattern.search(plain):
                return name
        return INCOME if amount > 0 else OTHER
