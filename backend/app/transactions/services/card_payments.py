"""Paying a credit card bill: the category "Pago de Cartão de Crédito".

Card purchases count as spending on the day they were made. Paying the bill a month later
only moves money from the account to the card, so the payment stays out of spending, with
the transfers, but under its own category: the person reads "this paid the card" instead
of a bare "Transferência".

The exception is a card the app doesn't read (no card of that bank, no other side of the
payment). Its purchases are nowhere in the app, so the payment is the only trace of that
money, and it counts as spending, still under this category.
"""

import re
import unicodedata
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.categories.models import Category
from app.categories.services.categorize import CARD_PAYMENT, INCOME, OTHER, TRANSFER
from app.transactions.models import ReviewStatus, Transaction, TxKind

# How banks write the bill payment on the checking account.
_BILL = re.compile(
    r"^(pagamento|pagto|pgto|pag|pg)\.?\s+(d[aeo]\s+)?(fatura|cartao)"
    r"|\bfatura\s+(d[oa]\s+)?cartao\b"
    r"|^(liquidacion|pago)\s+(de\s+)?(la\s+)?tarjeta"
    r"|^(credit\s+)?card\s+(bill\s+)?(re)?payment"
)
# And on the card itself, where it arrives as a credit ("Pagamento recebido").
_CARD_SIDE = re.compile(r"^(pagamento|pagto|pgto|pago)\b")
# Categories the app gives on its own; a line in any other was chosen by the person.
_AUTOMATIC = (TRANSFER, OTHER, INCOME)


def _plain(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch)).strip()


def reads_as_bill_payment(description: str, on_card: bool) -> bool:
    plain = _plain(description)
    return bool((_CARD_SIDE if on_card else _BILL).search(plain))


async def card_in_app(db: AsyncSession, tx: Transaction) -> bool:
    """The app sees the card this payment went to, so its purchases are already counted."""
    account = await db.get(Account, tx.account_id)
    if account is None or account.is_card or tx.transfer_pair_id is not None:
        return True
    same_bank_card = await db.scalar(
        select(Account.id)
        .where(
            Account.family_id == tx.family_id,
            Account.is_card.is_(True),
            func.lower(Account.bank) == account.bank.lower(),
        )
        .limit(1)
    )
    return same_bank_card is not None


def kind_for(in_app: bool) -> TxKind:
    return TxKind.TRANSFER if in_app else TxKind.REGULAR


async def _is_bill_payment(db: AsyncSession, tx: Transaction) -> bool:
    account = await db.get(Account, tx.account_id)
    if account is None:
        return False
    if account.is_card:
        # Money arriving on the card that isn't a refund of a purchase.
        return tx.amount > 0 and (
            tx.kind == TxKind.TRANSFER or reads_as_bill_payment(tx.description, on_card=True)
        )
    if tx.amount >= 0:
        return False
    if tx.transfer_pair_id is not None:
        other = await db.get(Transaction, tx.transfer_pair_id)
        other_account = await db.get(Account, other.account_id) if other else None
        if other_account is not None and other_account.is_card:
            return True
    return reads_as_bill_payment(tx.description, on_card=False)


async def recognize(db: AsyncSession, family_id: uuid.UUID, import_id: uuid.UUID) -> None:
    """Bill payments that just came in get the category, and every line in it is put on
    the right side again (a card connected now takes its old payments out of spending)."""
    category = await _category(db, family_id)
    if category is None:
        return
    automatic = select(Category.id).where(
        Category.family_id == family_id, Category.system_key.in_(_AUTOMATIC)
    )
    new = list(
        await db.scalars(
            select(Transaction).where(
                Transaction.family_id == family_id,
                Transaction.import_id == import_id,
                Transaction.review != ReviewStatus.REJECTED,
                Transaction.kind != TxKind.INVESTMENT,
                or_(
                    Transaction.category_id.is_(None),
                    Transaction.category_id.in_(automatic),
                    Transaction.category_id == category.id,
                ),
            )
        )
    )
    for tx in new:
        if tx.category_id != category.id and not await _is_bill_payment(db, tx):
            continue
        tx.category_id = category.id
        # The other side, often from an earlier statement, says the same.
        other = await db.get(Transaction, tx.transfer_pair_id) if tx.transfer_pair_id else None
        if other is not None:
            other.category_id = category.id
    await db.flush()
    await settle_all(db, family_id, category)


async def settle_all(db: AsyncSession, family_id: uuid.UUID, category: Category) -> None:
    lines = await db.scalars(
        select(Transaction).where(
            Transaction.family_id == family_id, Transaction.category_id == category.id
        )
    )
    for tx in lines:
        tx.kind = kind_for(await card_in_app(db, tx))
    await db.flush()


async def category_if_bill_payment(db: AsyncSession, tx: Transaction) -> Category | None:
    """The card payment category, when a line the person called a transfer paid a card."""
    if not await _is_bill_payment(db, tx):
        return None
    return await _category(db, tx.family_id)


async def _category(db: AsyncSession, family_id: uuid.UUID) -> Category | None:
    category: Category | None = await db.scalar(
        select(Category).where(Category.family_id == family_id, Category.system_key == CARD_PAYMENT)
    )
    return category
