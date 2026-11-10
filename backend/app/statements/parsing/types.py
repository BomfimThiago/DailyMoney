from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Literal

# "eb" and "pluggy": read from a connected bank, not from a file.
Format = Literal["csv", "ofx", "xlsx", "pdf", "eb", "pluggy"]
SUPPORTED_CURRENCIES = ("BRL", "USD", "EUR")
# regular: spending or income. investment and transfer count as neither.
RowKind = Literal["regular", "investment", "transfer"]


@dataclass(frozen=True)
class ParsedRow:
    date: date
    description: str
    # Signed, in the row's own currency: negative is money leaving the account.
    amount: Decimal
    currency: str
    # Text of the source line; identifies the row across re-imports of the same file.
    raw: str
    external_id: str | None = None
    # The bank itself says this is money moving between the holder's own balances.
    is_transfer: bool = False
    # Set by read_statement from the bank's flag and the description.
    kind: RowKind = "regular"


@dataclass(frozen=True)
class RowError:
    row: int  # 1-based position among the data rows
    message: str
    raw: str


@dataclass
class ParsedStatement:
    format: Format
    bank: str | None = None
    is_card: bool = False
    rows: list[ParsedRow] = field(default_factory=list)
    errors: list[RowError] = field(default_factory=list)
