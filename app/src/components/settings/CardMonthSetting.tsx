import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { styles as page } from '@/components/connections/styles';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { billDay, setBillDays } from '@/lib/people';
import { useAccounts, useRefreshMoney } from '@/lib/queries';
import type { Account } from '@/lib/types';
import { colors, fonts } from '@/theme';

type By = 'bill' | 'purchase';

const OPTIONS: { value: By; label: string; hint: string }[] = [
  {
    value: 'bill',
    label: 'No mês da fatura',
    hint: 'A compra conta no mês em que a fatura vence, quando o dinheiro sai da conta.',
  },
  {
    value: 'purchase',
    label: 'No dia da compra',
    hint: 'A compra conta no dia em que foi feita, mesmo que a fatura venha depois.',
  },
];

// In which month a credit card purchase counts, and each card's closing and due days
// (without them the app can't tell which bill a purchase falls in).
export function CardMonthSetting() {
  const { state } = useAuth();
  const refreshMoney = useRefreshMoney();
  const saved: By = state.status === 'signedIn' ? state.me.family.card_purchases_by : 'bill';
  const [picked, setPicked] = useState<By | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const value = picked ?? saved;
  const accounts = useAccounts(true);
  const cards = (accounts.data ?? []).filter((a) => a.is_card);

  async function choose(next: By) {
    if (next === value) return;
    setStatus('saving');
    try {
      await api('/family', { method: 'PATCH', body: JSON.stringify({ card_purchases_by: next }) });
      setPicked(next);
      setStatus('idle');
      await refreshMoney();
    } catch {
      setStatus('error');
    }
  }

  return (
    <View style={page.card}>
      <Text style={page.bank}>Compras no cartão de crédito</Text>
      <Text style={page.status}>
        Em que mês cada compra no cartão conta nas saídas. O pagamento da fatura fica fora, para
        nada contar duas vezes.
      </Text>
      <View style={styles.options} accessibilityRole="radiogroup">
        {OPTIONS.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => choose(o.value)}
              disabled={status === 'saving'}
              testID={`card-month-${o.value}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[styles.option, on && styles.optionOn]}
            >
              <View style={[styles.dot, on && styles.dotOn]} />
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>{o.label}</Text>
                <Text style={styles.optionHint}>{o.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {status === 'error' ? (
        <Text style={page.error}>Não consegui salvar. Tente de novo.</Text>
      ) : null}
      {value === 'bill' && cards.length > 0 ? (
        <View style={styles.cards}>
          <Text style={styles.label}>Dias de cada cartão</Text>
          {cards.map((card) => (
            <CardDays key={card.id} card={card} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CardDays({ card }: { card: Account }) {
  const refreshMoney = useRefreshMoney();
  const [close, setClose] = useState(card.bill_close_day ? String(card.bill_close_day) : '');
  const [due, setDue] = useState(card.bill_due_day ? String(card.bill_due_day) : '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const closeDay = billDay(close);
  const dueDay = billDay(due);
  const dirty = closeDay !== card.bill_close_day || dueDay !== card.bill_due_day;
  const typedWrong = (close.trim() !== '' && !closeDay) || (due.trim() !== '' && !dueDay);
  const known = card.bill_close_day && card.bill_due_day;

  async function save() {
    setStatus('saving');
    try {
      await setBillDays(card.id, closeDay, dueDay);
      setStatus('saved');
      await refreshMoney();
    } catch {
      setStatus('error');
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardName}>{card.name}</Text>
      <View style={styles.days}>
        <DayInput label="Fecha no dia" value={close} onChange={setClose} id={`${card.id}-close`} />
        <DayInput label="Vence no dia" value={due} onChange={setDue} id={`${card.id}-due`} />
        <Button
          label="Salvar"
          onPress={save}
          disabled={!dirty || typedWrong}
          busy={status === 'saving'}
        />
      </View>
      {typedWrong ? (
        <Text style={page.error}>Escreva um dia de 1 a 31.</Text>
      ) : status === 'error' ? (
        <Text style={page.error}>Não consegui salvar. Tente de novo.</Text>
      ) : status === 'saved' && !dirty ? (
        <Text style={page.result}>Salvo. As compras deste cartão já estão no mês da fatura.</Text>
      ) : known ? null : (
        <Text style={styles.hint}>
          Sem os dois dias, as compras deste cartão contam no dia da compra.
        </Text>
      )}
    </View>
  );
}

function DayInput({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  id: string;
}) {
  return (
    <View style={styles.dayField}>
      <Text style={styles.dayLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={2}
        placeholder="—"
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        testID={id}
        style={styles.dayInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  options: { gap: 8, marginTop: 10 },
  option: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  optionOn: { borderColor: colors.ink },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 1,
  },
  dotOn: { borderWidth: 5, borderColor: colors.ink },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  optionHint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  cards: { marginTop: 14, gap: 12 },
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  card: { gap: 6 },
  cardName: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  days: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' },
  dayField: { gap: 4 },
  dayLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  dayInput: {
    width: 76,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
  },
  hint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
});
