import re

# Bank names as files spell them → one short, stable name per bank.
_KNOWN: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"revolut", re.I), "Revolut"),
    (re.compile(r"\bwise\b|transferwise", re.I), "Wise"),
    (re.compile(r"caixa\s*bank|\bla\s*caixa\b", re.I), "CaixaBank"),
    (re.compile(r"\bbanco\s+inter\b|\binter\s*&?\s*co\b", re.I), "Inter"),
    (re.compile(r"nubank|nu\s+pagamentos", re.I), "Nubank"),
    (re.compile(r"\bbbva\b", re.I), "BBVA"),
    (re.compile(r"santander", re.I), "Santander"),
    (re.compile(r"\bita[uú]\b", re.I), "Itaú"),
]


def canonical_bank(raw: str | None) -> str | None:
    name = (raw or "").strip()
    if not name:
        return None
    for pattern, short in _KNOWN:
        if pattern.search(name):
            return short
    return name[:80]
