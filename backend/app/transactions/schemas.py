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


# ── analysis ─────────────────────────────────────────────────────────────────


class MonthSpending(BaseModel):
    month: str
    amount: Decimal


class CategoryChange(BaseModel):
    name: str
    # This month, and the average of the months before it in the period that have data.
    amount: Decimal
    average: Decimal


class Habit(BaseModel):
    name: str
    category: str | None
    count: int
    previous_count: int
    total: Decimal


class PeakDay(BaseModel):
    date: date
    amount: Decimal
    # Where most of that day's money went, biggest first (at most two).
    merchants: list[str]


class Recurring(BaseModel):
    name: str
    category: str | None
    # The last charge, and how many of the last four months had one.
    amount: Decimal
    last_date: date
    months: int


class CurrencyAnalysis(BaseModel):
    currency: Currency
    # Each month of the period, oldest first.
    months: list[MonthSpending]
    # Average of the months before the chosen one that have any spending; None if none.
    average: Decimal | None
    changes: list[CategoryChange]
    habits: list[Habit]
    # Average spending per weekday over the period, Monday first, without Moradia.
    weekdays: list[Decimal]
    peaks: list[PeakDay]
    recurring: list[Recurring]
    # The recurring charges' last amounts added up: roughly what they cost per month.
    recurring_total: Decimal


class Analysis(BaseModel):
    month: str
    months: int
    currencies: list[CurrencyAnalysis]
