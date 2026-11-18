"""What a card purchase says about its bill and installments."""

import re
from typing import Any

_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
# Nubank's card statement: "Loja X - Parcela 3/10"; other banks write "Parc 03/10".
_INSTALLMENT = re.compile(r"\bparc(?:ela)?\.?\s*(\d{1,2})\s*/\s*(\d{1,2})\b", re.IGNORECASE)


def installment(number: object, total: object) -> str | None:
    """'3/10' for the 3rd of 10 installments; None for a purchase paid at once."""
    try:
        n, t = int(str(number)), int(str(total))
    except (TypeError, ValueError):
        return None
    if t < 2 or not 1 <= n <= t or t > 99:
        return None
    return f"{n}/{t}"


def installment_in_text(description: str) -> str | None:
    """The installment written in the purchase's description, when the bank writes it."""
    found = _INSTALLMENT.search(description)
    return installment(found.group(1), found.group(2)) if found else None


def bill_month(value: object) -> str | None:
    """The bill's month (YYYY-MM) from a date like '2026-12-05' or '2026-12-05T00:00:00Z'."""
    month = str(value or "")[:7]
    return month if _MONTH.match(month) else None


def pluggy_card_details(tx: dict[str, Any]) -> tuple[str | None, str | None]:
    """Bill month and installment from Pluggy's creditCardMetadata."""
    meta = tx.get("creditCardMetadata") or {}
    return (
        bill_month(meta.get("billForecastDate")),
        installment(meta.get("installmentNumber"), meta.get("totalInstallments")),
    )
