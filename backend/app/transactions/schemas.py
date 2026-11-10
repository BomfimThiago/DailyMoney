import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.families.models import Currency
from app.transactions.models import TxKind


class TransactionOut(BaseModel):
    id: uuid.UUID
    date: date
    description: str
    amount: Decimal
    currency: Currency
    kind: TxKind
    account_id: uuid.UUID
    account_name: str
    category_id: uuid.UUID | None
    category_name: str | None
    member_id: uuid.UUID | None


class TransactionPage(BaseModel):
    total: int
    items: list[TransactionOut]


class TransactionUpdate(BaseModel):
    category_id: uuid.UUID
    # "Valer para as próximas deste estabelecimento" (spec: Trocar a categoria).
    apply_to_merchant: bool = False


class KindUpdate(BaseModel):
    # What the person says a line was. "pending" is only ever set by the import.
    kind: Literal[TxKind.REGULAR, TxKind.INVESTMENT, TxKind.TRANSFER]


# ── month summary ────────────────────────────────────────────────────────────


class CurrencySummary(BaseModel):
    currency: Currency
    income: Decimal
    spending: Decimal
    # Put into investments minus taken out of them.
    invested: Decimal
    invested_in: Decimal
    invested_out: Decimal
    # income − spending − invested
    left: Decimal


class MonthSummary(BaseModel):
    month: str  # YYYY-MM
    # One entry per currency the family has accounts in (no conversion yet).
    currencies: list[CurrencySummary]
    pending_transfers: int


class SpendingShare(BaseModel):
    name: str
    amount: Decimal


class CurrencyDashboard(BaseModel):
    currency: Currency
    # Spending (regular lines going out) per day of the month: index 0 is day 1.
    daily: list[Decimal]
    # The same for the month before, to compare the pace day by day.
    previous_daily: list[Decimal]
    # Biggest first. Lines with no category count as "Outros".
    categories: list[SpendingShare]
    accounts: list[SpendingShare]


class MonthDashboard(BaseModel):
    month: str
    currencies: list[CurrencyDashboard]


# ── investments ──────────────────────────────────────────────────────────────


class InvestmentProduct(BaseModel):
    name: str
    account_id: uuid.UUID
    account_name: str
    currency: Currency
    # Since the first imported line: put in, taken out, and the difference.
    put_in: Decimal
    taken_out: Decimal
    net: Decimal
    month_net: Decimal
    last_date: date


class InvestmentMonth(BaseModel):
    month: str
    currency: Currency
    put_in: Decimal
    taken_out: Decimal
    net: Decimal


class InvestmentTotal(BaseModel):
    currency: Currency
    put_in: Decimal
    taken_out: Decimal
    net: Decimal


class InvestmentOverview(BaseModel):
    month: str
    # All products together, per currency, since the first imported line.
    totals: list[InvestmentTotal]
    products: list[InvestmentProduct]
    # The chosen month and the five before it, per currency.
    history: list[InvestmentMonth]
    movements: list[TransactionOut]


# ── transfers ────────────────────────────────────────────────────────────────


class TransferOut(BaseModel):
    id: uuid.UUID
    date: date
    description: str
    # Money leaving one account and arriving in another. A side not imported is None.
    from_account: str | None
    to_account: str | None
    amount: Decimal
    currency: Currency
    # Currency exchange (Wise BRL → USD): what arrived on the other side.
    to_amount: Decimal | None = None
    to_currency: Currency | None = None
    kind: Literal["pair", "exchange", "single"]


class TransferOverview(BaseModel):
    month: str
    pending: list[TransactionOut]
    confirmed: list[TransferOut]
