"""Reading Pluggy investments and turning them into the portfolio the screen shows."""

from datetime import date
from decimal import Decimal

import pytest

from app.families.models import Currency
from app.portfolio.services import summary
from app.portfolio.services.mapping import NO_NAME, map_investment, map_investments
from app.portfolio.services.summary import Held

D = Decimal


def _cdb(**over: object) -> dict[str, object]:
    base: dict[str, object] = {
        "id": "inv-1",
        "name": "CDB Banco Exemplo",
        "type": "FIXED_INCOME",
        "subtype": "CDB",
        "issuer": "Banco Exemplo",
        "currencyCode": "BRL",
        "balance": 1050.37,
        "amountOriginal": 1000,
        "rate": 110,
        "rateType": "CDI",
        "dueDate": "2028-03-15T03:00:00.000Z",
        "date": "2026-11-17T02:30:00.000Z",
        "status": "ACTIVE",
    }
    return {**base, **over}


def test_fixed_income_keeps_everything_the_bank_says() -> None:
    p = map_investment(_cdb())
    assert (p.external_id, p.name, p.type, p.subtype) == (
        "inv-1",
        "CDB Banco Exemplo",
        "FIXED_INCOME",
        "CDB",
    )
    assert (p.currency, p.balance, p.amount_original) == (Currency.BRL, D("1050.37"), D("1000.00"))
    assert (p.rate, p.rate_type, p.status) == (D("110"), "CDI", "ACTIVE")
    # Due date at 03:00 UTC is midnight in Brasília; the balance day is also Brasília's.
    assert p.due_date == date(2028, 3, 15)
    assert p.value_date == date(2026, 11, 16)


def test_balance_is_read_as_text_not_float() -> None:
    assert map_investment(_cdb(balance=0.1 + 0.2)).balance == D("0.30")


def test_share_without_amount_put_in_or_due_date() -> None:
    p = map_investment(
        _cdb(
            name="",
            code="BOVA11",
            type="ETF",
            subtype=None,
            amountOriginal=None,
            dueDate=None,
            rate=None,
            rateType=None,
            status=None,
        )
    )
    assert (p.name, p.amount_original, p.due_date, p.rate_type, p.status) == (
        "BOVA11",
        None,
        None,
        None,
        "ACTIVE",
    )


def test_no_name_no_code_uses_issuer_then_a_placeholder() -> None:
    assert map_investment(_cdb(name=None, code=None)).name == "Banco Exemplo"
    assert map_investment(_cdb(name=" ", code=None, issuer=None)).name == NO_NAME


def test_one_unreadable_investment_does_not_stop_the_others() -> None:
    positions, errors = map_investments(
        [
            _cdb(),
            _cdb(id="x", name="Fundo em iene", currencyCode="JPY"),
            _cdb(id="y", date=None),
            _cdb(id="z", balance=None),
        ]
    )
    assert [p.external_id for p in positions] == ["inv-1"]
    assert len(errors) == 3
    assert errors[0].startswith("Fundo em iene: moeda não suportada")


@pytest.mark.parametrize(
    ("type_", "subtype", "key"),
    [
        ("FIXED_INCOME", "CDB", "fixed"),
        ("FIXED_INCOME", "TREASURY", "treasury"),
        ("EQUITY", "STOCK", "stocks"),
        ("EQUITY", "REAL_ESTATE_FUND", "real_estate"),
        ("ETF", None, "etf"),
        ("MUTUAL_FUND", "ETF_FUND", "etf"),
        ("MUTUAL_FUND", None, "funds"),
        ("SECURITY", "PENSION", "pension"),
        ("COE", None, "other"),
    ],
)
def test_class_of_each_kind(type_: str, subtype: str | None, key: str) -> None:
    assert summary.investment_class(type_, subtype) == key


def _held(value: str, type_: str = "FIXED_INCOME", **over: object) -> Held:
    base: dict[str, object] = dict(
        key=value,
        bank="Inter",
        type=type_,
        subtype=None,
        value=D(value),
        invested=None,
        due_date=None,
    )
    return Held(**{**base, **over})  # type: ignore[arg-type]


def test_classes_with_their_share_biggest_first() -> None:
    groups = summary.by_class([_held("100", "ETF"), _held("300"), _held("600"), _held("0", "ETF")])
    assert [(g.label, g.total, g.share) for g in groups] == [
        ("Renda fixa", D("900"), D("0.9000")),
        ("ETFs", D("100"), D("0.1000")),
    ]
    assert [h.value for h in groups[0].items] == [D("600"), D("300")]
    assert summary.share(D("1"), D("0")) == D("0")


def test_gain_only_where_the_amount_put_in_is_known() -> None:
    assert summary.tracked([_held("50", "ETF")]) is None
    t = summary.tracked(
        [_held("1100", invested=D("1000")), _held("525", invested=D("500")), _held("50", "ETF")]
    )
    assert t is not None
    assert (t.invested, t.value, t.gain, t.gain_pct) == (D("1500"), D("1625"), D("125"), D("8.3"))
    assert summary.tracked([_held("0", invested=D("0"))]).gain_pct is None  # type: ignore[union-attr]


def test_amount_put_in_goes_to_the_lens_by_the_balance_rate() -> None:
    # A US$ 110 balance shown as R$ 660 (rate 6): US$ 100 put in is R$ 600.
    assert summary.invested_in_lens(D("110"), D("660"), D("100")) == D("600.00")
    assert summary.invested_in_lens(D("0"), D("0"), D("100")) is None
    assert summary.invested_in_lens(D("10"), D("10"), None) is None


def test_by_bank_biggest_first() -> None:
    held = [_held("10", bank="Nubank"), _held("30"), _held("15", bank="Nubank")]
    assert summary.by_bank(held) == [("Inter", D("30")), ("Nubank", D("25"))]


def test_what_matures_in_the_next_twelve_months() -> None:
    today = date(2026, 11, 17)
    held = [
        _held("100", due_date=date(2027, 11, 16)),
        _held("200", due_date=date(2027, 11, 17)),  # exactly a year: not inside
        _held("300", due_date=date(2026, 11, 1)),  # already past
        _held("400"),
    ]
    assert summary.maturing(held, today) == (1, D("100"))
    assert summary.add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)


def test_ladder_from_this_year_with_gaps_and_a_last_catch_all_step() -> None:
    today = date(2026, 11, 17)
    held = [
        _held("100", due_date=date(2025, 1, 1)),  # past due but open: this year
        _held("200", due_date=date(2028, 6, 1)),
        _held("300", due_date=date(2040, 1, 1)),
        _held("50", "ETF"),
    ]
    ladder = summary.maturity_ladder(held, today, max_years=4)
    assert ladder is not None
    assert [(s.label, s.total, s.count) for s in ladder.steps] == [
        ("2026", D("100"), 1),
        ("2027", D("0"), 0),
        ("2028", D("200"), 1),
        ("2029+", D("300"), 1),
    ]
    assert (ladder.dated_total, ladder.dated_count) == (D("600"), 3)
    assert (ladder.undated_total, ladder.undated_count) == (D("50"), 1)
    assert summary.maturity_ladder([_held("1")], today) is None
    short = summary.maturity_ladder([_held("1", due_date=date(2027, 1, 1))], today)
    assert short is not None and [s.label for s in short.steps] == ["2026", "2027"]


@pytest.mark.parametrize(
    ("rate", "rate_type", "fixed", "label"),
    [
        (D("100"), "CDI", None, "100% do CDI"),
        (D("110.5"), "CDI", D("0"), "110,5% do CDI"),
        (D("100"), "SELIC", D("0.1"), "100% da Selic + 0,1% a.a."),
        (D("100"), "IPCA", D("6.5"), "IPCA + 6,5% a.a."),
        (D("90"), "IPCA", None, "90% do IPCA"),
        (D("100"), "DOLAR", None, "100% do dólar"),
        (None, None, D("12"), "12% a.a."),
        (None, None, None, None),
    ],
)
def test_rate_in_words(
    rate: Decimal | None, rate_type: str | None, fixed: Decimal | None, label: str | None
) -> None:
    assert summary.rate_label(rate, rate_type, fixed) == label


def test_history_carries_each_balance_forward_until_the_next_one() -> None:
    since = date(2026, 1, 1)
    points = summary.history_points(
        [
            [(date(2025, 12, 1), D("100")), (date(2026, 1, 10), D("110"))],
            [(date(2026, 1, 5), D("50")), (date(2026, 1, 20), D("0"))],
        ],
        since,
    )
    assert points == [
        (date(2026, 1, 5), D("150")),
        (date(2026, 1, 10), D("160")),
        (date(2026, 1, 20), D("110")),
    ]
