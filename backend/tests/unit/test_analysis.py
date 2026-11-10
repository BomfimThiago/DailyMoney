from datetime import date
from decimal import Decimal

from app.families.models import Currency
from app.transactions.schemas import CurrencyAnalysis
from app.transactions.services.analysis_service import Spend, analyse, display_name

EUR = Currency.EUR
TODAY = date(2026, 11, 30)


def s(day: str, amount: str, description: str, category: str | None = "Outros") -> Spend:
    return Spend(EUR, date.fromisoformat(day), Decimal(amount), description, category)


def run(
    rows: list[Spend], month: str = "2026-10", months: int = 6, today: date = TODAY
) -> CurrencyAnalysis:
    [result] = analyse(rows, [EUR], month, months, today)
    return result


def test_display_name_drops_bank_wording_codes_and_shouting() -> None:
    assert display_name("Compra no débito - MERCADONA 2610") == "Mercadona"
    assert display_name("BOLT.EU/O/2610") == "Bolt.eu/o/2610"
    assert display_name("Uber *Trip") == "Uber *Trip"
    assert display_name("Café da esquina") == "Café da esquina"


def test_months_and_average_ignore_months_before_the_first_line() -> None:
    rows = [
        s("2026-08-05", "100", "A"),
        s("2026-09-05", "300", "A"),
        s("2026-10-05", "500", "A"),
    ]
    r = run(rows)
    assert [m.month for m in r.months] == [
        "2026-05",
        "2026-06",
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
    ]
    assert [m.amount for m in r.months][-3:] == [Decimal(100), Decimal(300), Decimal(500)]
    # August and September only: May to July had nothing imported yet.
    assert r.average == Decimal("200.0000")


def test_no_earlier_month_means_no_average_and_no_changes() -> None:
    r = run([s("2026-10-05", "50", "A", "Mercado")])
    assert r.average is None
    assert r.changes == []


def test_changes_compare_each_category_with_its_average() -> None:
    rows = [
        s("2026-08-03", "100", "Glovo", "Restaurantes"),
        s("2026-09-03", "100", "Glovo", "Restaurantes"),
        s("2026-10-03", "400", "Glovo", "Restaurantes"),
        s("2026-09-04", "60", "Mercadona", "Mercado"),
        s("2026-10-04", "50", "Mercadona", "Mercado"),
        s("2026-09-05", "80", "Cine", "Lazer"),
    ]
    r = run(rows)
    assert [(c.name, c.amount, c.average) for c in r.changes] == [
        ("Restaurantes", Decimal(400), Decimal("100.0000")),
        ("Lazer", Decimal(0), Decimal("40.0000")),
        ("Mercado", Decimal(50), Decimal("30.0000")),
    ]


def test_habits_count_repeat_purchases_against_the_month_before() -> None:
    rows = [s(f"2026-10-{d:02d}", "12", f"Uber *Trip {d}", "Transporte") for d in (1, 2, 3, 4)]
    rows += [s(f"2026-09-{d:02d}", "12", "Uber *Trip", "Transporte") for d in (1, 2)]
    rows += [s(f"2026-10-{d:02d}", "3", "Compra no débito - CAFE SOL", None) for d in (5, 6)]
    [habit] = run(rows).habits
    assert (habit.name, habit.category, habit.count, habit.previous_count, habit.total) == (
        "Uber *Trip",
        "Transporte",
        4,
        2,
        Decimal(48),
    )


def test_weekdays_average_per_weekday_without_housing() -> None:
    # 2026-10-05 and 2026-10-12 are Mondays; the period runs from the 5th to the 18th.
    rows = [
        s("2026-10-05", "30", "A"),
        s("2026-10-12", "10", "B"),
        s("2026-10-06", "900", "Aluguel", "Moradia"),
    ]
    r = run(rows, today=date(2026, 10, 18))
    assert r.weekdays[0] == Decimal("20.0000")
    assert r.weekdays[1] == Decimal(0)
    assert len(r.weekdays) == 7


def test_peaks_are_the_costliest_days_with_where_the_money_went() -> None:
    rows = [
        s("2026-10-17", "120", "El Corte Ingles"),
        s("2026-10-17", "60", "Restaurante Lua"),
        s("2026-10-17", "5", "Cafe"),
        s("2026-10-03", "90", "Ikea"),
        s("2026-10-10", "20", "Lidl"),
        s("2026-10-11", "10", "Lidl"),
        s("2026-10-01", "1500", "Aluguel", "Moradia"),
    ]
    peaks = run(rows).peaks
    assert [(p.date.day, p.amount) for p in peaks] == [
        (17, Decimal(185)),
        (3, Decimal(90)),
        (10, Decimal(20)),
    ]
    assert peaks[0].merchants == ["El Corte Ingles", "Restaurante Lua"]


def test_recurring_finds_subscriptions_and_steady_monthly_charges() -> None:
    rows = [
        # A known subscription: two months are enough.
        s("2026-09-12", "13.99", "NETFLIX.COM", "Assinaturas"),
        s("2026-10-12", "13.99", "NETFLIX.COM", "Assinaturas"),
        # A gym billed once a month for three months, about the same amount.
        s("2026-08-01", "29.99", "BASIC FIT", "Lazer"),
        s("2026-09-01", "29.99", "BASIC FIT", "Lazer"),
        s("2026-10-01", "31.00", "BASIC FIT", "Lazer"),
        # Groceries: every month, but many times and different amounts.
        s("2026-08-02", "80", "Mercadona", "Mercado"),
        s("2026-09-02", "40", "Mercadona", "Mercado"),
        s("2026-09-20", "60", "Mercadona", "Mercado"),
        s("2026-10-02", "75", "Mercadona", "Mercado"),
        # Stopped in July: not counted any more.
        s("2026-07-08", "9.99", "Disney Plus", "Assinaturas"),
        s("2026-08-08", "9.99", "Disney Plus", "Assinaturas"),
    ]
    found = run(rows).recurring
    assert [(f.name, f.amount, f.months) for f in found] == [
        ("Basic Fit", Decimal("31.00"), 3),
        ("Netflix.com", Decimal("13.99"), 2),
    ]
    assert found[0].last_date == date(2026, 10, 1)
    assert run(rows).recurring_total == Decimal("44.99")


def test_varying_amounts_are_not_a_fixed_charge() -> None:
    rows = [
        s("2026-08-01", "40", "Iberdrola", "Moradia"),
        s("2026-09-01", "80", "Iberdrola", "Moradia"),
        s("2026-10-01", "60", "Iberdrola", "Moradia"),
    ]
    assert run(rows).recurring == []


def test_every_currency_gets_an_analysis_even_without_lines() -> None:
    [brl, eur] = analyse([], [Currency.BRL, EUR], "2026-10", 3, TODAY)
    assert (brl.currency, eur.currency) == (Currency.BRL, EUR)
    assert [m.amount for m in eur.months] == [Decimal(0)] * 3
    assert eur.weekdays == [Decimal(0)] * 7
    assert (eur.habits, eur.peaks, eur.recurring) == ([], [], [])
