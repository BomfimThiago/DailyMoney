"""Entradas and saídas of a set of lines, with investment moves netted.

Money put into an investment and taken back out is the family's own money changing place:
only what was put in beyond what came back (or the other way round) counts. A €3.400
aplicação and a €2.250 resgate in the same period are €1.150 of spending, not €3.400 of
spending plus €2.250 of income. The balance (entradas − saídas) is the same either way.
"""

from decimal import Decimal

ZERO = Decimal("0")


class Flow:
    def __init__(self) -> None:
        self.income = self.spending = ZERO
        self.put_in = self.taken_out = ZERO

    def add(self, amount: Decimal, investment: bool = False) -> None:
        if investment:
            if amount < 0:
                self.put_in -= amount
            else:
                self.taken_out += amount
        elif amount > 0:
            self.income += amount
        else:
            self.spending -= amount

    @property
    def invested(self) -> Decimal:
        """Put in minus taken out; negative when more came back than went in."""
        return self.put_in - self.taken_out

    @property
    def total_income(self) -> Decimal:
        return self.income + max(-self.invested, ZERO)

    @property
    def total_spending(self) -> Decimal:
        return self.spending + max(self.invested, ZERO)
