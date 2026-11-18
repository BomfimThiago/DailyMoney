import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { Segment } from '@/components/nav';
import { Loadable } from '@/components/states';
import { TxRow } from '@/components/TxRow';
import { billMonthName, billStatus, homeBillLine, nextBillLine, purchases } from '@/lib/cards';
import { currentMonth, money, monthLabel, shiftMonth } from '@/lib/format';
import { useBillPurchases, useCardBills } from '@/lib/queries';
import type { CardBills } from '@/lib/types';

import { styles } from './styles';

// "‹ Fatura de novembro 2026 ›". Bills are the bank's calendar months; the next month's
// bill is already open, so one month ahead is as far as it goes.
export function BillNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const last = month >= shiftMonth(currentMonth(), 1);
  return (
    <View style={styles.nav}>
      <Pressable
        onPress={() => onChange(shiftMonth(month, -1))}
        accessibilityRole="button"
        accessibilityLabel="Fatura anterior"
        style={styles.arrow}
      >
        <Text style={styles.arrowText}>‹</Text>
      </Pressable>
      <Text style={styles.navText}>Fatura de {monthLabel(month).toLowerCase()}</Text>
      <Pressable
        onPress={() => onChange(shiftMonth(month, 1))}
        disabled={last}
        accessibilityRole="button"
        accessibilityLabel="Próxima fatura"
        style={[styles.arrow, last && styles.off]}
      >
        <Text style={styles.arrowText}>›</Text>
      </Pressable>
    </View>
  );
}

type Which = 'bill' | 'next';

// One card: the month's bill (and whether it was paid), the next one, and the purchases.
export function CardBillsCard({ card, wide }: { card: CardBills; wide: boolean }) {
  const [which, setWhich] = useState<Which>('bill');
  const bill = which === 'bill' ? card.bill : card.next;
  return (
    <View style={[styles.card, wide && styles.wideCard]} testID="card-bill">
      <Text style={styles.cardName}>{card.account_name.toUpperCase()}</Text>
      {wide ? <WideFigures card={card} /> : <PhoneFigures card={card} />}
      <View style={styles.segment}>
        <Segment
          options={[
            { value: 'bill', label: `Fatura de ${billMonthName(card.bill.month)}` },
            { value: 'next', label: `Próxima (${billMonthName(card.next.month)})` },
          ]}
          value={which}
          onChange={setWhich}
        />
      </View>
      <Purchases accountId={card.account_id} month={bill.month} count={bill.count} />
    </View>
  );
}

function statusStyle(card: CardBills) {
  if (card.status === 'paid') return styles.paid;
  if (card.status === 'unpaid') return styles.late;
  return null;
}

function PhoneFigures({ card }: { card: CardBills }) {
  return (
    <>
      <Text style={styles.heroLabel}>Fatura de {billMonthName(card.bill.month)}</Text>
      <Text style={styles.heroValue}>{money(card.bill.total, card.currency)}</Text>
      <Text style={[styles.status, statusStyle(card)]}>{billStatus(card)}</Text>
      <View style={styles.nextRow}>
        <View style={styles.nextText}>
          <Text style={styles.nextTitle}>Próxima fatura · {billMonthName(card.next.month)}</Text>
          <Text style={styles.sub}>{nextBillLine(card)}</Text>
        </View>
        <Text style={styles.nextValue}>{money(card.next.total, card.currency)}</Text>
      </View>
    </>
  );
}

function WideFigures({ card }: { card: CardBills }) {
  const month = billMonthName(card.bill.month);
  const last = card.payments.at(-1);
  return (
    <View style={styles.figures}>
      <Figure
        label={`FATURA DE ${month.toUpperCase()}`}
        value={money(card.bill.total, card.currency)}
        sub={billStatus(card)}
        subStyle={statusStyle(card)}
      />
      <Figure
        label={`PAGO EM ${month.toUpperCase()}`}
        value={money(card.paid, card.currency)}
        sub={
          last
            ? `${card.payments.length === 1 ? '1 pagamento' : `${card.payments.length} pagamentos`}`
            : 'Nenhum pagamento no mês'
        }
        divider
      />
      <Figure
        label={`PRÓXIMA · ${billMonthName(card.next.month).toUpperCase()}`}
        value={money(card.next.total, card.currency)}
        sub={nextBillLine(card)}
        divider
      />
    </View>
  );
}

function Figure({
  label,
  value,
  sub,
  subStyle,
  divider,
}: {
  label: string;
  value: string;
  sub: string;
  subStyle?: StyleProp<object>;
  divider?: boolean;
}) {
  return (
    <View style={[styles.figure, divider && styles.divider]}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.sub, subStyle]}>{sub}</Text>
    </View>
  );
}

// The purchases charged in one bill, whatever day they were made, with their installment.
function Purchases({
  accountId,
  month,
  count,
}: {
  accountId: string;
  month: string;
  count: number;
}) {
  const query = useBillPurchases(accountId, month, count > 0);
  if (count === 0) return <Text style={styles.listEmpty}>Nenhuma compra nesta fatura.</Text>;
  return (
    <>
      <Text style={styles.listTitle}>{purchases(count).toUpperCase()}</Text>
      <Loadable
        isError={query.isError}
        loading={!query.data}
        value={query.data?.items.length ? query.data.items : null}
        empty="Nenhuma compra nesta fatura."
        error="Não consegui carregar as compras. Tente de novo."
        textStyle={styles.listEmpty}
      >
        {(items) => (
          <View>
            {items.map((t, i) => (
              <TxRow key={t.id} t={t} first={i === 0} />
            ))}
          </View>
        )}
      </Loadable>
    </>
  );
}

// Início: "Fatura de novembro: R$ 450,00 · paga  Ver", only when a card has a bill.
export function CardBillLink({ style }: { style?: StyleProp<ViewStyle> }) {
  const query = useCardBills(currentMonth(), true);
  const line = query.data ? homeBillLine(query.data.cards) : null;
  if (!line) return null;
  return (
    <Pressable
      onPress={() => router.navigate('/cartoes')}
      accessibilityRole="link"
      testID="card-bill-link"
      style={[styles.link, style]}
    >
      <Text style={styles.linkText}>{line}</Text>
      <Text style={styles.linkAction}>Ver</Text>
    </Pressable>
  );
}
