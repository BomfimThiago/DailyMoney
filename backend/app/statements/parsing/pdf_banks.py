"""Readers for each bank's PDF statement. Each one checks its numbers against totals or
balances the bank printed, so a misread value never gets imported silently."""

import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Protocol

from app.statements.parsing.errors import StatementError
from app.statements.parsing.pdf import Line, Segment
from app.statements.parsing.tabular import parse_amount, parse_date
from app.statements.parsing.types import ParsedRow, ParsedStatement, RowError

_MONTHS = {
    "JAN": 1, "FEV": 2, "MAR": 3, "ABR": 4, "MAI": 5, "JUN": 6,
    "JUL": 7, "AGO": 8, "SET": 9, "OUT": 10, "NOV": 11, "DEZ": 12,
}  # fmt: skip
_BR_AMOUNT = re.compile(r"^[+-]?\s?\d{1,3}(?:\.\d{3})*,\d{2}$")


class TextReader(Protocol):
    def matches(self, text: str) -> bool: ...
    def read(self, lines: list[Line]) -> ParsedStatement: ...


class OcrReader(Protocol):
    def matches(self, text: str) -> bool: ...
    def read(self, passes: list[str]) -> ParsedStatement: ...


def _br(text: str) -> Decimal:
    return parse_amount(text.replace(" ", ""), ",")


def _add_checked(
    statement: ParsedStatement, index: int, ok: bool, row: ParsedRow, why: str
) -> None:
    """A row the bank's own totals confirm is imported; otherwise it becomes an error."""
    if ok:
        statement.rows.append(row)
    else:
        statement.errors.append(RowError(index, why, row.raw))


def _not_empty(statement: ParsedStatement) -> ParsedStatement:
    if not statement.rows and not statement.errors:
        raise StatementError("Este extrato não tem nenhuma transação. Nada para importar.")
    return statement


# ── Nubank (conta) ───────────────────────────────────────────────────────────


_NU_DAY = re.compile(r"^(\d{2}) ([A-Z]{3}) (\d{4})$")
_NU_TOTAL = re.compile(r"^Total de (entradas|saídas)$")
# Item titles start at the left of the column; descriptions continue further right.
_NU_CONTINUATION_X = 200.0
_NU_AMOUNT_X = 470.0


@dataclass
class _Item:
    date: date
    sign: int
    title: str
    detail: list[str]
    amount: Decimal
    raw: str

    def description(self) -> str:
        return f"{self.title} - {' '.join(self.detail)}" if self.detail else self.title


@dataclass
class _Section:
    date: date
    sign: int
    total: Decimal
    items: list[_Item] = field(default_factory=list)

    def adds_up(self) -> bool:
        return sum((i.amount for i in self.items), Decimal(0)) == self.total


@dataclass
class _NubankBody:
    """Reads the "Movimentações" pages line by line into sections of a day."""

    sections: list[_Section] = field(default_factory=list)
    in_body: bool = False
    seen_body: bool = False
    day: date | None = None

    def feed(self, line: Line) -> None:
        if self._boundary(line.text) or not self.in_body:
            return
        segments = self._after_day(list(line.segments))
        if segments and self.day is not None:
            self._content(segments, line.text, self.day)

    def _boundary(self, text: str) -> bool:
        if text.startswith(("Tem alguma dúvida", "O saldo líquido")):
            self.in_body = False
            return True
        if text == "Movimentações":
            self.in_body = self.seen_body = True
            return True
        if self.seen_body and "VALORES EM R$" in text:
            self.in_body = True
            return True
        return False

    def _after_day(self, segments: list[Segment]) -> list[Segment]:
        """A line can start with the day ("03 OUT 2026"); it holds for the lines below."""
        m = _NU_DAY.match(segments[0].text)
        if not m or m[2] not in _MONTHS:
            return segments
        self.day = date(int(m[3]), _MONTHS[m[2]], int(m[1]))
        return segments[1:]

    def _content(self, segments: list[Segment], text: str, day: date) -> None:
        last = segments[-1].text if segments[-1].x1 > _NU_AMOUNT_X else ""
        amount = _br(last) if _BR_AMOUNT.match(last) else None
        if m := _NU_TOTAL.match(segments[0].text):
            if amount is None:
                raise StatementError("Não consegui ler os totais do extrato do Nubank.")
            sign = 1 if m[1] == "entradas" else -1
            self.sections.append(_Section(day, sign, abs(amount)))
        elif self.sections:
            self._item(self.sections[-1], segments, amount, text, day)

    @staticmethod
    def _item(
        section: _Section, segments: list[Segment], amount: Decimal | None, text: str, day: date
    ) -> None:
        if amount is not None:
            middle = [s.text for s in segments[1:-1]]
            section.items.append(_Item(day, section.sign, segments[0].text, middle, amount, text))
        elif segments[0].x0 >= _NU_CONTINUATION_X and section.items:
            section.items[-1].detail.append(" ".join(s.text for s in segments))


class NubankPdf:
    """Days hold 'Total de entradas' / 'Total de saídas' sections; items show the amount
    without a sign, so the sign comes from the section, and each section must add up to
    the total the bank printed."""

    def matches(self, text: str) -> bool:
        return (
            "Movimentações" in text
            and "Total de entradas" in text
            or ("Total de saídas" in text and "nubank" in text.lower())
        )

    def read(self, lines: list[Line]) -> ParsedStatement:
        body = _NubankBody()
        for line in lines:
            body.feed(line)
        statement = ParsedStatement(format="pdf", bank="Nubank")
        items = [(item, section.adds_up()) for section in body.sections for item in section.items]
        for index, (item, ok) in enumerate(items, start=1):
            amount = item.sign * item.amount
            description = item.description()
            raw = f"{item.date.isoformat()} {amount} {description}"
            row = ParsedRow(
                date=item.date, description=description, amount=amount, currency="BRL", raw=raw
            )
            why = (
                f"A soma do dia {item.date:%d/%m} não confere com o total do "
                "extrato; estas linhas ficaram de fora"
            )
            _add_checked(statement, index, ok, row, why)
        return _not_empty(statement)


# ── Itaú (conta) ─────────────────────────────────────────────────────────────


_ITAU_DATE = re.compile(r"^\d{2}/\d{2}/\d{4}$")


def _itau_columns(line: Line) -> tuple[float, float] | None:
    """Right edges of the "valor" and "saldo" columns, from their header line."""
    texts = [s.text for s in line.segments]
    if "valor (R$)" not in texts or "saldo (R$)" not in texts:
        return None
    return line.segments[texts.index("valor (R$)")].x1, line.segments[texts.index("saldo (R$)")].x1


class ItauPdf:
    """One line per entry: date, description, value, sometimes the day's balance.
    'SALDO ...' lines are balances, not transactions."""

    def matches(self, text: str) -> bool:
        return "itau" in text.lower().replace("ú", "u") and "lançamentos" in text

    def read(self, lines: list[Line]) -> ParsedStatement:
        columns: tuple[float, float] | None = None
        statement = ParsedStatement(format="pdf", bank="Itaú")
        for line in lines:
            if found := _itau_columns(line):
                columns = found
            elif columns:
                self._entry(statement, line, columns)
        if columns is None:
            raise StatementError("Não reconheci as colunas do extrato do Itaú.")
        return _not_empty(statement)

    @staticmethod
    def _entry(statement: ParsedStatement, line: Line, columns: tuple[float, float]) -> None:
        segments = line.segments
        if len(segments) < 3 or not _ITAU_DATE.match(segments[0].text):
            return
        description = segments[1].text
        if description.upper().startswith("SALDO"):
            return
        index = len(statement.rows) + len(statement.errors) + 1
        value_x, balance_x = columns
        # The value column is the right-aligned segment nearest the "valor" header.
        amounts = [
            s
            for s in segments[2:]
            if abs(s.x1 - value_x) < abs(s.x1 - balance_x)
            and _BR_AMOUNT.match(s.text.replace(" ", ""))
        ]
        if not amounts:
            statement.errors.append(RowError(index, "Linha sem valor", line.text))
            return
        statement.rows.append(
            ParsedRow(
                date=parse_date(segments[0].text),
                description=description,
                amount=_br(amounts[-1].text),
                currency="BRL",
                raw=line.text,
            )
        )


# ── Inter (conta) ────────────────────────────────────────────────────────────

_PT_MONTHS = {
    "janeiro": 1, "fevereiro": 2, "março": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}  # fmt: skip
_BRL = re.compile(r"^(-?)R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})$")
_INTER_DAY = re.compile(
    r"^(\d{1,2}) de (\w+) de (\d{4}) Saldo do dia: (-?R\$\s?[\d.]+,\d{2})$", re.I
)


def _brl(text: str) -> Decimal | None:
    m = _BRL.match(text.strip())
    if not m:
        return None
    value = _br(m[2])
    return -value if m[1] else value


@dataclass
class _InterDay:
    date: date
    balance: Decimal
    rows: list[tuple[str, Decimal, str]] = field(default_factory=list)

    def add_entry(self, line: Line) -> None:
        """An entry line ends with its amount and the balance after it."""
        segments = line.segments
        if len(segments) < 3:
            return
        amount = _brl(segments[-2].text)
        if amount is None or _brl(segments[-1].text) is None:
            return
        self.rows.append((" ".join(s.text for s in segments[:-2]), amount, line.text))


def _inter_day(text: str) -> _InterDay | None:
    m = _INTER_DAY.match(text)
    if not m or m[2].lower() not in _PT_MONTHS:
        return None
    balance = _brl(m[4])
    if balance is None:  # pragma: no cover - the regex already checked it
        return None
    return _InterDay(date(int(m[3]), _PT_MONTHS[m[2].lower()], int(m[1])), balance)


class InterPdf:
    """Entries grouped by day under '15 de Agosto de 2026 Saldo do dia: R$ 10,00'. Each
    day must take the previous day's balance to the one the bank printed for it."""

    def matches(self, text: str) -> bool:
        return "Banco Inter" in text and "Saldo do dia" in text

    def read(self, lines: list[Line]) -> ParsedStatement:
        days: list[_InterDay] = []
        for line in lines:
            if day := _inter_day(line.segments[0].text):
                days.append(day)
            elif days:
                days[-1].add_entry(line)
        statement = ParsedStatement(format="pdf", bank="Inter")
        for index, (day, (description, amount, text), ok) in enumerate(_checked(days), start=1):
            raw = f"{day.date.isoformat()} {text}"
            row = ParsedRow(
                date=day.date, description=description, amount=amount, currency="BRL", raw=raw
            )
            why = (
                f"O dia {day.date:%d/%m} não confere com o saldo do extrato; "
                "estas linhas ficaram de fora"
            )
            _add_checked(statement, index, ok, row, why)
        return _not_empty(statement)


_InterEntry = tuple[_InterDay, tuple[str, Decimal, str], bool]


def _checked(days: list[_InterDay]) -> list[_InterEntry]:
    """Each entry with whether its day takes the previous balance to the printed one."""
    out: list[_InterEntry] = []
    previous: Decimal | None = None
    for day in days:
        # The first day has no earlier balance to check against.
        ok = previous is None or previous + sum(a for _, a, _ in day.rows) == day.balance
        previous = day.balance
        out.extend((day, row, ok) for row in day.rows)
    return out


# ── Revolut (conta) ──────────────────────────────────────────────────────────

_EN_MONTHS = {
    m: i
    for i, m in enumerate(
        ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
        start=1,
    )
}
_MONEY = re.compile(r"^(-?)[€$£]\s?(\d{1,3}(?:,\d{3})*\.\d{2})$")


def _money(text: str) -> Decimal | None:
    m = _MONEY.match(text.strip())
    if not m:
        return None
    value = Decimal(m[2].replace(",", ""))
    return -value if m[1] else value


_REVOLUT_DATE = re.compile(r"^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$")
_REVOLUT_LABEL = re.compile(r"^(Reference|To|From|Card):\s?(.*)$")
_REVOLUT_CURRENCY = re.compile(r"\b([A-Z]{3}) Statement\b")
# Where the description column starts and where the amount columns start.
_REVOLUT_DESCRIPTION_X = (150.0, 330.0)


def _in_revolut_description(x: float) -> bool:
    return _REVOLUT_DESCRIPTION_X[0] <= x < _REVOLUT_DESCRIPTION_X[1]


@dataclass
class _RevolutRow:
    date: date
    amount: Decimal
    title: list[str]
    reference: list[str] = field(default_factory=list)
    label: str | None = None

    def description(self) -> str:
        text = " ".join(self.title)
        return f"{text} - {' '.join(self.reference)}" if self.reference else text

    def add_line(self, text: str) -> None:
        """A line under the row: more title, a label such as "Reference:", or its value."""
        if label := _REVOLUT_LABEL.match(text):
            self.label = label[1]
            if label[1] == "Reference":
                self.reference.append(label[2])
        elif self.label is None:
            self.title.append(text)
        elif self.label == "Reference":
            self.reference.append(text)


@dataclass
class _RevolutTable:
    """Reads the current account's table line by line."""

    totals: tuple[Decimal, Decimal] | None = None
    rows: list[_RevolutRow] = field(default_factory=list)
    in_table: bool = False
    columns: tuple[float, float] | None = None  # x of "Money out" and "Money in"
    current: _RevolutRow | None = None

    def feed(self, line: Line) -> None:
        if self._summary(line) or self._section(line.segments[0].text) or self._columns(line):
            return
        if not self.in_table or self.columns is None:
            return
        if not self._new_row(line, self.columns):
            self._continuation(line)

    def _summary(self, line: Line) -> bool:
        if self.totals is not None or not line.segments[0].text.startswith("Account ("):
            return False
        money = [v for s in line.segments[1:] if (v := _money(s.text)) is not None]
        if len(money) >= 3:
            self.totals = (money[1], money[2])
        return True

    def _section(self, text: str) -> bool:
        if text.startswith("Account transactions from"):
            self.in_table = True
            return True
        if " transactions from " in text:
            self.in_table = False
            self.current = None
            return True
        return False

    def _columns(self, line: Line) -> bool:
        texts = [s.text for s in line.segments]
        if "Money out" not in texts or "Money in" not in texts:
            return False
        segments = line.segments
        self.columns = (segments[texts.index("Money out")].x0, segments[texts.index("Money in")].x0)
        self.current = None
        return True

    def _new_row(self, line: Line, columns: tuple[float, float]) -> bool:
        m = _REVOLUT_DATE.match(line.segments[0].text)
        if not m or m[1] not in _EN_MONTHS:
            return False
        self.current = None
        amounts = [
            (s.x0, v)
            for s in line.segments
            if s.x0 >= _REVOLUT_DESCRIPTION_X[1] and (v := _money(s.text)) is not None
        ]
        # A row prints its amount and the balance after it.
        if len(amounts) >= 2:
            x, value = amounts[0]
            out_x, in_x = columns
            sign = -1 if abs(x - out_x) < abs(x - in_x) else 1
            title = [s.text for s in line.segments if _in_revolut_description(s.x0)]
            day = date(int(m[3]), _EN_MONTHS[m[1]], int(m[2]))
            self.current = _RevolutRow(day, sign * value, title)
            self.rows.append(self.current)
        return True

    def _continuation(self, line: Line) -> None:
        if self.current is None or not _in_revolut_description(line.segments[0].x0):
            self.current = None
            return
        self.current.add_line(line.text)


class RevolutPdf:
    """Only the current account's table is read; savings pockets show up there as
    'To/From EUR <pocket>' moves. Within a day the printed balances are not in row order,
    so the check is the money in and money out totals of the balance summary."""

    def matches(self, text: str) -> bool:
        return "Revolut Bank" in text and "Account transactions from" in text

    def read(self, lines: list[Line]) -> ParsedStatement:
        currency_match = _REVOLUT_CURRENCY.search("\n".join(line.text for line in lines))
        currency = currency_match[1] if currency_match else ""
        if currency not in ("BRL", "USD", "EUR"):
            raise StatementError("Moeda do extrato da Revolut não suportada (só BRL, USD e EUR).")
        table = _RevolutTable()
        for line in lines:
            table.feed(line)
        if table.totals is None:
            raise StatementError("Não encontrei o resumo de saldos do extrato da Revolut.")
        return _revolut_statement(table.rows, table.totals, currency)


def _revolut_statement(
    rows: list[_RevolutRow], totals: tuple[Decimal, Decimal], currency: str
) -> ParsedStatement:
    money_out = sum((-r.amount for r in rows if r.amount < 0), Decimal(0))
    money_in = sum((r.amount for r in rows if r.amount > 0), Decimal(0))
    ok = (money_out, money_in) == totals
    statement = ParsedStatement(format="pdf", bank="Revolut")
    why = "Os valores não conferem com o resumo do extrato; nada foi importado"
    for index, row in enumerate(rows, start=1):
        description = row.description()
        raw = f"{row.date.isoformat()} {row.amount} {description}"
        parsed = ParsedRow(
            date=row.date, description=description, amount=row.amount, currency=currency, raw=raw
        )
        _add_checked(statement, index, ok, parsed, why)
    return _not_empty(statement)


# ── CaixaBank (PDF de imagem, via OCR) ───────────────────────────────────────


@dataclass(frozen=True)
class _OcrRead:
    description: str
    day: date
    amount: Decimal  # magnitude only: OCR drops minus signs, the balances give the sign
    negative: bool
    balance: Decimal

    def signed(self) -> Decimal:
        return -self.amount if self.negative else self.amount


class CaixaBankOcr:
    """Rows are newest first: concept, date, amount, balance. OCR can drop a minus sign or
    misread a digit, so a row is only accepted when its amount equals the difference
    between its balance and the next (older) row's balance; the sign comes from that
    difference. Several OCR passes are combined: per row, the first reading that checks
    out wins. Rows no reading confirms are shown as unread, never imported."""

    _ROW = re.compile(
        r"^(?P<desc>.+?)\s+(?P<date>\d{2}/\d{2}/\d{4})\s+(?P<amount>-?\s?\d+(?:[.,]\d{1,2})?)"
        r"\s+(?P<balance>-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?P<tail>\S{0,2})$"
    )
    _PAGE = re.compile(r"^\d+\s*/\s*\d+$")
    _HEADER = re.compile(r"^Concepto\s+Fecha\s+Importe\s+Saldo", re.I)

    def matches(self, text: str) -> bool:
        flat = text.lower()
        return "caixabank" in flat.replace(" ", "") or (
            "concepto" in flat and "importe" in flat and "saldo" in flat
        )

    def read(self, passes: list[str]) -> ParsedStatement:
        lines = [self._lines(text) for text in passes]
        primary = lines[0]
        if primary is None:
            raise StatementError("Não reconheci as colunas do extrato da CaixaBank.")
        # Only passes that found the same number of rows can be lined up row by row.
        aligned = [p for p in lines if p is not None and len(p) == len(primary)]
        reads = [
            self._ordered([r for p in aligned if (r := self._parse(p[i])) is not None])
            for i in range(len(primary))
        ]

        statement = ParsedStatement(format="pdf", bank="CaixaBank")
        for i, candidates in enumerate(reads):
            older = reads[i + 1] if i + 1 < len(reads) else None
            confirmed = self._confirm(candidates, older)
            if isinstance(confirmed, str):
                statement.errors.append(RowError(i + 1, confirmed, primary[i]))
                continue
            chosen, signed = confirmed
            statement.rows.append(
                ParsedRow(
                    date=chosen.day,
                    description=chosen.description,
                    amount=signed,
                    currency="EUR",
                    raw=f"{chosen.day.isoformat()} {signed} {chosen.balance} {chosen.description}",
                )
            )
        return _not_empty(statement)

    @staticmethod
    def _confirm(
        candidates: list[_OcrRead], older: list[_OcrRead] | None
    ) -> tuple[_OcrRead, Decimal] | str:
        """The reading of a row its balance confirms, with its sign; or why there is none."""
        if not candidates:
            return "Não consegui ler esta linha"
        if older is None:
            # The oldest row has no older balance to check against; it keeps the sign as read.
            return candidates[0], candidates[0].signed()
        match = next(
            (
                (c, c.balance - o.balance)
                for c in candidates
                for o in older
                if abs(c.balance - o.balance) == c.amount
            ),
            None,
        )
        if match is not None:
            return match
        if older:
            return "O valor lido não confere com o saldo"
        return "Não consegui conferir o valor pelo saldo"

    def _lines(self, text: str) -> list[str] | None:
        out: list[str] | None = None
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if out is None:
                if self._HEADER.match(line):
                    out = []
                continue
            if not self._PAGE.match(line):
                out.append(line)
        return out

    def _parse(self, line: str) -> _OcrRead | None:
        m = self._ROW.match(line)
        if not m:
            return None
        try:
            day = parse_date(m["date"])
        except ValueError:
            return None
        amount_text = m["amount"].replace(" ", "")
        balance_text = m["balance"]
        # The last separator before two digits is the decimal one.
        balance = Decimal(re.sub(r"[.,]", "", balance_text[:-3]) + "." + balance_text[-2:])
        return _OcrRead(
            description=m["desc"].strip(),
            day=day,
            amount=abs(Decimal(amount_text.replace(",", "."))),
            negative=amount_text.startswith("-"),
            balance=balance,
        )

    @staticmethod
    def _ordered(reads: list[_OcrRead]) -> list[_OcrRead]:
        unique: list[_OcrRead] = []
        for r in reads:
            if r not in unique:
                unique.append(r)
        return unique


TEXT_READERS: list[TextReader] = [NubankPdf(), ItauPdf(), InterPdf(), RevolutPdf()]
OCR_READERS: list[OcrReader] = [CaixaBankOcr()]
