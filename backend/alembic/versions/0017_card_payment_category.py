"""card payment category: paying the card bill, out of spending under its own name

Revision ID: 9e4a2c7b5d13
Revises: 5d2c8a91e4b7
Create Date: 2026-11-19 07:00:00

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "9e4a2c7b5d13"
down_revision: Union[str, Sequence[str], None] = "5d2c8a91e4b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen here, like the other default names (categorize.CARD_PAYMENT).
NAME = "Pago de Cartão de Crédito"
COLOR = "#7b8794"
# A category the family made itself for the same thing ("Pago Cartão de Crédito").
OWN = r"^(pago|pagamento|pagto)( d[aeo])? (cart[aã]o|fatura)"
# How banks write the bill payment (card_payments._BILL / _CARD_SIDE).
BILL = (
    r"^(pagamento|pagto|pgto|pag|pg)\.?\s+(d[aeo]\s+)?(fatura|cart[aã]o)"
    r"|\yfatura\s+(d[oa]\s+)?cart[aã]o\y"
    r"|^(liquidaci[oó]n|pago)\s+(de\s+)?(la\s+)?tarjeta"
    r"|^(credit\s+)?card\s+(bill\s+)?(re)?payment"
)
CARD_SIDE = r"^(pagamento|pagto|pgto|pago)\y"


def upgrade() -> None:
    # 1. A family that already made its own card payment category keeps it, as the default.
    op.execute(
        f"""
        UPDATE category c SET name = '{NAME}', system_key = '{NAME}', kind = 'transfer'
        FROM (
            SELECT DISTINCT ON (family_id) id FROM category
            WHERE system_key IS NULL AND name ~* '{OWN}'
            ORDER BY family_id, sort_order, created_at
        ) own
        WHERE c.id = own.id AND NOT EXISTS (
            SELECT 1 FROM category x
            WHERE x.family_id = c.family_id AND x.id <> c.id AND x.name = '{NAME}'
        )
        """
    )
    # 2. Every other family gets it.
    op.execute(
        f"""
        INSERT INTO category (id, family_id, name, kind, color, sort_order, system_key, created_at)
        SELECT gen_random_uuid(), f.id, '{NAME}', 'transfer', '{COLOR}',
               COALESCE((SELECT MAX(c.sort_order) FROM category c WHERE c.family_id = f.id), 0) + 1,
               '{NAME}', now()
        FROM family f
        WHERE NOT EXISTS (
            SELECT 1 FROM category c WHERE c.family_id = f.id AND c.system_key = '{NAME}'
        )
        """
    )
    # 3. Bill payments the app had filed as a plain transfer (or Outros/Renda) move in.
    op.execute(
        f"""
        UPDATE transaction t SET category_id = card.id
        FROM account a, category card
        WHERE a.id = t.account_id
          AND card.family_id = t.family_id AND card.system_key = '{NAME}'
          AND t.kind <> 'investment' AND t.review <> 'rejected'
          AND (t.category_id IS NULL OR t.category_id IN (
                SELECT id FROM category
                WHERE family_id = t.family_id
                  AND system_key IN ('Transferência', 'Outros', 'Renda')))
          AND (
            (a.is_card AND t.amount > 0
             AND (t.kind = 'transfer' OR t.description ~* '{CARD_SIDE}'))
            OR (NOT a.is_card AND t.amount < 0 AND (
                t.description ~* '{BILL}'
                OR EXISTS (
                    SELECT 1 FROM transaction o JOIN account oa ON oa.id = o.account_id
                    WHERE o.id = t.transfer_pair_id AND oa.is_card)))
          )
        """
    )
    # The other side of a payment that moved in goes with it.
    op.execute(
        f"""
        UPDATE transaction o SET category_id = t.category_id
        FROM transaction t, category card
        WHERE o.id = t.transfer_pair_id
          AND card.id = t.category_id AND card.system_key = '{NAME}'
        """
    )
    # 4. Each line in it stays out of spending when the app sees the card it paid (a card
    #    account, the other side, or a card of the same bank); otherwise it counts.
    op.execute(
        f"""
        UPDATE transaction t SET kind = CASE WHEN (
                a.is_card OR t.transfer_pair_id IS NOT NULL OR EXISTS (
                    SELECT 1 FROM account c
                    WHERE c.family_id = t.family_id AND c.is_card
                      AND lower(c.bank) = lower(a.bank))
            ) THEN 'transfer'::tx_kind ELSE 'regular'::tx_kind END
        FROM account a, category card
        WHERE a.id = t.account_id
          AND card.id = t.category_id AND card.system_key = '{NAME}'
        """
    )


def downgrade() -> None:
    """Lines go back to Transferência (or no category); the category this added goes away.

    One the family had made itself (another colour) keeps the new name and only loses its
    default key.
    """
    op.execute(
        f"""
        UPDATE transaction t SET category_id = (
            SELECT tr.id FROM category tr
            WHERE tr.family_id = t.family_id AND tr.system_key = 'Transferência')
        FROM category card
        WHERE card.id = t.category_id AND card.system_key = '{NAME}'
          AND card.color = '{COLOR}' AND t.kind = 'transfer'
        """
    )
    added = f"system_key = '{NAME}' AND color = '{COLOR}'"
    op.execute(
        f"DELETE FROM category_rule r USING category c WHERE r.category_id = c.id AND c.{added}"
    )
    op.execute(f"DELETE FROM category WHERE {added}")
    op.execute(f"UPDATE category SET system_key = NULL WHERE system_key = '{NAME}'")
