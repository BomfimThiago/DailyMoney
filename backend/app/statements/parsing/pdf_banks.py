"""Readers for each bank's PDF statement. Each one checks its numbers against totals or
balances the bank printed, so a misread value never gets imported silently."""

import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Protocol

from app.statements.parsing.errors import StatementError
from app.statements.parsing.pdf import Line
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


# ── Nubank (conta) ───────────────────────────────────────────────────────────


@dataclass
class _Item:
    date: date
    sign: int
    title: str
    detail: list[str]
    amount: Decimal
    raw: str


@dataclass
class _Section:
    date: date
    sign: int
    total: Decimal
    items: list[_Item] = field(default_factory=list)


class NubankPdf:
    """Days hold 'Total de entradas' / 'Total de saídas' sections; items show the amount
    without a sign, so the sign comes from the section, and each section must add up to
    the total the bank printed."""

    _DAY = re.compile(r"^(\d{2}) ([A-Z]{3}) (\d{4})$")
    _TOTAL = re.compile(r"^Total de (entradas|saídas)$")
    # Item titles start at the left of the column; descriptions continue further right.
    _CONTINUATION_X = 200.0
    _AMOUNT_X = 470.0

    def matches(self, text: str) -> bool:
        return (
            "Movimentações" in text
            and "Total de entradas" in text
            or ("Total de saídas" in text and "nubank" in text.lower())
        )

    def read(self, lines: list[Line]) -> ParsedStatement:
        sections: list[_Section] = []
        in_body = False
        seen_body = False
        day: date | None = None
        for line in lines:
            text = line.text
            if text.startswith(("Tem alguma dúvida", "O saldo líquido")):
                in_body = False
                continue
            if text == "Movimentações":
                in_body = seen_body = True
                continue
            if seen_body and "VALORES EM R$" in text:
                in_body = True
                continue
            if not in_body:
                continue
            segments = list(line.segments)
            if (m := self._DAY.match(segments[0].text)) and m[2] in _MONTHS:
                day = date(int(m[3]), _MONTHS[m[2]], int(m[1]))
                segments = segments[1:]
            if not segments or day is None:
                continue
            amount_text = segments[-1].text if segments[-1].x1 > self._AMOUNT_X else None
            if m := self._TOTAL.match(segments[0].text):
                if not amount_text or not _BR_AMOUNT.match(amount_text):
                    raise StatementError("Não consegui ler os totais do extrato do Nubank.")
                sign = 1 if m[1] == "entradas" else -1
                sections.append(_Section(day, sign, abs(_br(amount_text))))
                continue
            if not sections:
                continue
            section = sections[-1]
            if amount_text and _BR_AMOUNT.match(amount_text):
                middle = [s.text for s in segments[1:-1]]
                section.items.append(
                    _Item(day, section.sign, segments[0].text, middle, _br(amount_text), text)
                )
            elif segments[0].x0 >= self._CONTINUATION_X and section.items:
                section.items[-1].detail.append(" ".join(s.text for s in segments))

        statement = ParsedStatement(format="pdf", bank="Nubank")
        index = 0
        for section in sections:
            total = sum((i.amount for i in section.items), Decimal(0))
            for item in section.items:
                index += 1
                description = item.title
                if item.detail:
                    description += " - " + " ".join(item.detail)
                raw = f"{item.date.isoformat()} {item.sign * item.amount} {description}"
                if total != section.total:
                    statement.errors.append(
                        RowError(
                            index,
                            f"A soma do dia {item.date:%d/%m} não confere com o total do "
                            "extrato; estas linhas ficaram de fora",
                            raw,
                        )
                    )
                    continue
                statement.rows.append(
                    ParsedRow(
                        date=item.date,
                        description=description,
                        amount=item.sign * item.amount,
                        currency="BRL",
                        raw=raw,
                    )
                )
        if not statement.rows and not statement.errors:
            raise StatementError("Este extrato não tem nenhuma transação. Nada para importar.")
        return statement


# ── Itaú (conta) ─────────────────────────────────────────────────────────────


class ItauPdf:
    """One line per entry: date, description, value, sometimes the day's balance.
    'SALDO ...' lines are balances, not transactions."""

    _DATE = re.compile(r"^\d{2}/\d{2}/\d{4}$")

    def matches(self, text: str) -> bool:
        return "itau" in text.lower().replace("ú", "u") and "lançamentos" in text

    def read(self, lines: list[Line]) -> ParsedStatement:
        value_x: float | None = None
        balance_x: float | None = None
        statement = ParsedStatement(format="pdf", bank="Itaú")
        index = 0
        for line in lines:
            texts = [s.text for s in line.segments]
            if "valor (R$)" in texts and "saldo (R$)" in texts:
                value_x = line.segments[texts.index("valor (R$)")].x1
                balance_x = line.segments[texts.index("saldo (R$)")].x1
                continue
            if value_x is None or balance_x is None:
                continue
            first = line.segments[0]
            if not self._DATE.match(first.text) or len(line.segments) < 3:
                continue
            description = line.segments[1].text
            if description.upper().startswith("SALDO"):
                continue
            index += 1
            # The value column is the right-aligned segment nearest the "valor" header.
            amounts = [
                s
                for s in line.segments[2:]
                if abs(s.x1 - value_x) < abs(s.x1 - balance_x)
                and _BR_AMOUNT.match(s.text.replace(" ", ""))
            ]
            if not amounts:
                statement.errors.append(RowError(index, "Linha sem valor", line.text))
                continue
            statement.rows.append(
                ParsedRow(
                    date=parse_date(first.text),
                    description=description,
                    amount=_br(amounts[-1].text),
                    currency="BRL",
                    raw=line.text,
                )
            )
        if value_x is None:
            raise StatementError("Não reconheci as colunas do extrato do Itaú.")
        if not statement.rows and not statement.errors:
            raise StatementError("Este extrato não tem nenhuma transação. Nada para importar.")
        return statement


# ── Inter (conta) ────────────────────────────────────────────────────────────

_PT_MONTHS = {
    "janeiro": 1, "fevereiro": 2, "março": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}  # fmt: skip
_BRL = re.compile(r"^(-?)R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})$")


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


class InterPdf:
    """Entries grouped by day under '15 de Agosto de 2026 Saldo do dia: R$ 10,00'. Each
    day must take the previous day's balance to the one the bank printed for it."""

    _DAY = re.compile(r"^(\d{1,2}) de (\w+) de (\d{4}) Saldo do dia: (-?R\$\s?[\d.]+,\d{2})$", re.I)

    def matches(self, text: str) -> bool:
        return "Banco Inter" in text and "Saldo do dia" in text

    def read(self, lines: list[Line]) -> ParsedStatement:
        days: list[_InterDay] = []
        for line in lines:
            first = line.segments[0].text
            if (m := self._DAY.match(first)) and m[2].lower() in _PT_MONTHS:
                balance = _brl(m[4])
                if balance is None:  # pragma: no cover - the regex already checked it
                    continue
                days.append(
                    _InterDay(date(int(m[3]), _PT_MONTHS[m[2].lower()], int(m[1])), balance)
                )
                continue
            if not days or len(line.segments) < 3:
                continue
            amount = _brl(line.segments[-2].text)
            if amount is None or _brl(line.segments[-1].text) is None:
                continue
            description = " ".join(s.text for s in line.segments[:-2])
            days[-1].rows.append((description, amount, line.text))

        statement = ParsedStatement(format="pdf", bank="Inter")
        index = 0
        previous: Decimal | None = None
        for day in days:
            # The first day has no earlier balance to check against.
            ok = previous is None or previous + sum(a for _, a, _ in day.rows) == day.balance
            previous = day.balance
            for description, amount, text in day.rows:
                index += 1
                raw = f"{day.date.isoformat()} {text}"
                if not ok:
                    statement.errors.append(
                        RowError(
                            index,
                            f"O dia {day.date:%d/%m} não confere com o saldo do extrato; "
                            "estas linhas ficaram de fora",
                            raw,
                        )
                    )
                    continue
                statement.rows.append(
                    ParsedRow(
                        date=day.date,
                        description=description,
                        amount=amount,
                        currency="BRL",
                        raw=raw,
                    )
                )
        if not statement.rows and not statement.errors:
            raise StatementError("Este extrato não tem nenhuma transação. Nada para importar.")
        return statement


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


@dataclass
class _RevolutRow:
    date: date
    amount: Decimal
    title: list[str]
    reference: list[str] = field(default_factory=list)
    label: str | None = None


class RevolutPdf:
    """Only the current account's table is read; savings pockets show up there as
    'To/From EUR <pocket>' moves. Within a day the printed balances are not in row order,
    so the check is the money in and money out totals of the balance summary."""

    _DATE = re.compile(r"^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$")
    _LABEL = re.compile(r"^(Reference|To|From|Card):\s?(.*)$")
    _CURRENCY = re.compile(r"\b([A-Z]{3}) Statement\b")
    _DESCRIPTION_X = (150.0, 330.0)

    def matches(self, text: str) -> bool:
        return "Revolut Bank" in text and "Account transactions from" in text

    def read(self, lines: list[Line]) -> ParsedStatement:
        full_text = "\n".join(line.text for line in lines)
        currency_match = self._CURRENCY.search(full_text)
        currency = currency_match[1] if currency_match else ""
        if currency not in ("BRL", "USD", "EUR"):
            raise StatementError("Moeda do extrato da Revolut não suportada (só BRL, USD e EUR).")

        totals: tuple[Decimal, Decimal] | None = None
        out_x = in_x = None
        rows: list[_RevolutRow] = []
        in_table = False
        current: _RevolutRow | None = None
        for line in lines:
            first = line.segments[0]
            texts = [s.text for s in line.segments]
            if first.text.startswith("Account (") and totals is None:
                money = [v for s in line.segments[1:] if (v := _money(s.text)) is not None]
                if len(money) >= 3:
                    totals = (money[1], money[2])
                continue
            if first.text.startswith("Account transactions from"):
                in_table = True
                continue
            if " transactions from " in first.text:
                in_table = False
                current = None
                continue
            if "Money out" in texts and "Money in" in texts:
                out_x = line.segments[texts.index("Money out")].x0
                in_x = line.segments[texts.index("Money in")].x0
                current = None
                continue
            if not in_table or out_x is None or in_x is None:
                continue
            if (m := self._DATE.match(first.text)) and m[1] in _EN_MONTHS:
                current = None
                day = date(int(m[3]), _EN_MONTHS[m[1]], int(m[2]))
                title = [
                    s.text
                    for s in line.segments
                    if self._DESCRIPTION_X[0] <= s.x0 < self._DESCRIPTION_X[1]
                ]
                amounts = [
                    (s, v)
                    for s in line.segments
                    if s.x0 >= self._DESCRIPTION_X[1] and (v := _money(s.text)) is not None
                ]
                if len(amounts) < 2:
                    continue
                segment, value = amounts[0]
                sign = -1 if abs(segment.x0 - out_x) < abs(segment.x0 - in_x) else 1
                current = _RevolutRow(day, sign * value, title)
                rows.append(current)
                continue
            if current is None or not (self._DESCRIPTION_X[0] <= first.x0 < self._DESCRIPTION_X[1]):
                current = None
                continue
            text = line.text
            if label := self._LABEL.match(text):
                current.label = label[1]
                if label[1] == "Reference":
                    current.reference.append(label[2])
            elif current.label is None:
                current.title.append(text)
            elif current.label == "Reference":
                current.reference.append(text)

        if totals is None:
            raise StatementError("Não encontrei o resumo de saldos do extrato da Revolut.")
        money_out = sum((-r.amount for r in rows if r.amount < 0), Decimal(0))
        money_in = sum((r.amount for r in rows if r.amount > 0), Decimal(0))
        ok = (money_out, money_in) == totals

        statement = ParsedStatement(format="pdf", bank="Revolut")
        for index, row in enumerate(rows, start=1):
            description = " ".join(row.title)
            if row.reference:
                description += " - " + " ".join(row.reference)
            raw = f"{row.date.isoformat()} {row.amount} {description}"
            if not ok:
                statement.errors.append(
                    RowError(
                        index,
                        "Os valores não conferem com o resumo do extrato; nada foi importado",
                        raw,
                    )
                )
                continue
            statement.rows.append(
                ParsedRow(
                    date=row.date,
                    description=description,
                    amount=row.amount,
                    currency=currency,
                    raw=raw,
                )
            )
        if not statement.rows and not statement.errors:
            raise StatementError("Este extrato não tem nenhuma transação. Nada para importar.")
        return statement


# ── CaixaBank (PDF de imagem, via OCR) ───────────────────────────────────────


@dataclass(frozen=True)
class _OcrRead:
    description: str
    day: date
    amount: Decimal  # magnitude only: OCR drops minus signs, the balances give the sign
    negative: bool
    balance: Decimal


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
            index = i + 1
            if not candidates:
                statement.errors.append(RowError(index, "Não consegui ler esta linha", primary[i]))
                continue
            older = reads[i + 1] if i + 1 < len(reads) else None
            if older is None:
                # The oldest row has no older balance to check against; it keeps the sign
                # as read.
                chosen = candidates[0]
                signed = -chosen.amount if chosen.negative else chosen.amount
            else:
                match = next(
                    (
                        (c, c.balance - o.balance)
                        for c in candidates
                        for o in older
                        if abs(c.balance - o.balance) == c.amount
                    ),
                    None,
                )
                if match is None:
                    message = (
                        "O valor lido não confere com o saldo"
                        if older
                        else "Não consegui conferir o valor pelo saldo"
                    )
                    statement.errors.append(RowError(index, message, primary[i]))
                    continue
                chosen, signed = match
            statement.rows.append(
                ParsedRow(
                    date=chosen.day,
                    description=chosen.description,
                    amount=signed,
                    currency="EUR",
                    raw=f"{chosen.day.isoformat()} {signed} {chosen.balance} {chosen.description}",
                )
            )
        if not statement.rows and not statement.errors:
            raise StatementError("Este extrato não tem nenhuma transação. Nada para importar.")
        return statement

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
