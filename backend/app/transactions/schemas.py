import uuid
from datetime import date, datetime
from datetime import date as date_
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from app.families.models import Currency
from app.transactions.models import ReviewStatus, TxKind


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
    # "pending": just imported, waiting for the person's approval before it counts.
    review: ReviewStatus = ReviewStatus.APPROVED
    # When the screen shows another currency: the amount converted with its day's ECB rate.
    display_amount: Decimal | None = None
    display_currency: Currency | None = None
    # Card purchases: the bill they are charged in (YYYY-MM) and the installment ("3/10").
    card_bill: str | None = None
    installment: str | None = None


class TransactionPage(BaseModel):
    total: int
    items: list[TransactionOut]


class GroupTotal(BaseModel):
    # Null: lines with no category, or the whole household ("Casa").
    id: uuid.UUID | None
    name: str
    # Investment moves count only by what was put in beyond what came back (or the other
    # way round); these are the gross amounts behind that net.
    income: Decimal
    spending: Decimal
    invested_in: Decimal
    invested_out: Decimal
    count: int


class DayTotal(BaseModel):
    date: date_
    # Income minus spending of that day (negative when more went out).
    total: Decimal


class CurrencyTotals(BaseModel):
    currency: Currency
    income: Decimal
    spending: Decimal
    # income − spending
    balance: Decimal
    # Gross money put into / taken out of investments, already inside income/spending
    # (which follow the statement); the groups count investments by their net.
    invested_in: Decimal
    invested_out: Decimal
    count: int
    # The same lines added up by category, by Responsável and by account; biggest first.
    categories: list[GroupTotal]
    members: list[GroupTotal]
    accounts: list[GroupTotal]
    # Each day with lines, newest first: the total beside the day in the list.
    days: list[DayTotal]


class TransactionTotals(BaseModel):
    """What the list shows with the same filters, added up (every page, not just one)."""

    count: int
    # Only the currencies that have lines; just the chosen one when converted.
    currencies: list[CurrencyTotals]


class LatestMonth(BaseModel):
    # The month of the newest counted line; null when there are none yet.
    month: str | None


class CurrencyAmount(BaseModel):
    currency: Currency
    amount: Decimal
    # 1 unit of the line's currency in this one, that day (8 places).
    rate: Decimal


class LineCurrencies(BaseModel):
    """A line in BRL, EUR and USD, converted with the ECB rate of its day."""

    currency: Currency
    # The day of the rate used (the last published on or before the line's date).
    rate_date: date_ | None
    amounts: list[CurrencyAmount]


class TransactionUpdate(BaseModel):
    # Only the fields sent change. The currency follows the account, so it is not here.
    category_id: uuid.UUID | None = None
    # "Valer para as próximas deste estabelecimento" (spec: Trocar a categoria).
    apply_to_merchant: bool = False
    description: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
        | None
    ) = None
    date: date_ | None = None
    # Signed like the statement: negative is money leaving.
    amount: Annotated[Decimal, Field(max_digits=18, decimal_places=4)] | None = None
    # Who the line belongs to; sent as null it goes to the whole household ("Casa").
    member_id: uuid.UUID | None = None


class KindUpdate(BaseModel):
    # What the person says a line was. "pending" is only ever set by the import.
    kind: Literal[TxKind.REGULAR, TxKind.INVESTMENT, TxKind.TRANSFER]


# ── review of imported lines ─────────────────────────────────────────────────


class ReviewGroup(BaseModel):
    # The upload or bank read the lines came in; None for lines without one.
    import_id: uuid.UUID | None
    # The file name, or "Bank · account" for a bank read.
    label: str
    source: Literal["statement", "bank"]
    imported_at: datetime | None = None
    items: list[TransactionOut]


class ReviewQueue(BaseModel):
    total: int
    # Newest import first; lines newest first inside each.
    groups: list[ReviewGroup]


class ReviewDecision(BaseModel):
    ids: Annotated[list[uuid.UUID], Field(min_length=1, max_length=1000)]
    decision: Literal["approve", "reject"]


class ReviewResult(BaseModel):
    # Lines decided now (already decided or unknown ones are left alone).
    count: int
    # Lines still waiting for approval.
    left: int


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
    # One entry per currency the family has accounts in; just the chosen one when
    # amounts are converted (?currency=). Empty when there are no accounts yet.
    currencies: list[CurrencySummary]
    pending_transfers: int
    # Imported lines waiting for approval (any month); they don't count in the figures yet.
    to_review: int = 0


class SpendingShare(BaseModel):
    # What Transações filters this group by: a category, member or account id, a bank's
    # name, "none" (no category) or "casa" (the household).
    key: str
    name: str
    amount: Decimal


class CurrencyDashboard(BaseModel):
    currency: Currency
    # Spending (regular lines going out) per day of the month: index 0 is day 1.
    daily: list[Decimal]
    # The same for the month before, to compare the pace day by day.
    previous_daily: list[Decimal]
    # Biggest first. Lines with no category count as "Sem categoria".
    categories: list[SpendingShare]
    accounts: list[SpendingShare]
    # By whoever the line belongs to ("Casa" when nobody), and by the account's bank.
    people: list[SpendingShare] = []
    banks: list[SpendingShare] = []
    # Money coming in this month by category, biggest first (for the flow chart).
    income_categories: list[SpendingShare] = []
    # Entradas and Gastos of the month before, counted like the month summary.
    previous_income: Decimal = Decimal("0")
    previous_spending: Decimal = Decimal("0")


class MonthDashboard(BaseModel):
    month: str
    # The period's first and last day: the month may start on the family's chosen day.
    start: date
    end: date
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


class MovementRow(BaseModel):
    # Category of the moves (None: no category).
    name: str | None
    color: str | None
    went_out: Decimal
    came_in: Decimal
    # What arrived minus what left.
    net: Decimal
    count: int


class MovementGroup(BaseModel):
    currency: Currency
    rows: list[MovementRow]
    went_out: Decimal
    came_in: Decimal
    net: Decimal
    # closed: what left one account arrived in another (within 1%); out: money left and
    # didn't come back; in: money came from outside the app's accounts.
    result: Literal["closed", "out", "in"]


class MovementsOverview(BaseModel):
    month: str
    groups: list[MovementGroup]


class PurgeOverview(BaseModel):
    # Every line, of every month and review state.
    transactions: int
    to_review: int
    # Sent statements in the history.
    imports: int
    # Connected banks: they read their history again on the next sync.
    banks: int


class PurgeResult(BaseModel):
    removed: int


class BankPurgeAccount(BaseModel):
    id: uuid.UUID
    name: str
    currency: Currency
    is_card: bool
    transactions: int


class BankPurge(BaseModel):
    """One bank in "Apagar as transações de um banco": its accounts and their lines."""

    bank: str
    transactions: int
    to_review: int
    # Sent statements that only held this bank's lines: they leave the history too.
    imports: int
    # Some account of the bank comes from a connected bank (it reads its history again).
    connected: bool
    accounts: list[BankPurgeAccount]


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


# ── credit card bills ────────────────────────────────────────────────────────


class CardBill(BaseModel):
    month: str  # YYYY-MM
    # What the purchases charged in this bill add up to (refunds take off); positive.
    total: Decimal
    count: int


class CardPayment(BaseModel):
    date: date_
    amount: Decimal


class CardBills(BaseModel):
    account_id: uuid.UUID
    account_name: str
    bank: str | None
    # The card's own currency, or the one the screen asked for.
    currency: Currency
    bill: CardBill
    next: CardBill
    # Payments received on the card during the bill's month, oldest first.
    payments: list[CardPayment]
    paid: Decimal
    # paid: payments cover the bill. open: nothing (or not all) paid yet and the month
    # isn't over. unpaid: the month is over without payments covering it.
    status: Literal["paid", "open", "unpaid", "empty"]
    # Months with a bill on this card, newest first (to step through them).
    months: list[str]


class CardBillsOverview(BaseModel):
    month: str
    # False while no card line knows its bill yet (lines read before the app kept it).
    bills_known: bool
    cards: list[CardBills]
