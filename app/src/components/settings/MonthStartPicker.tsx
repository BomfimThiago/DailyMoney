import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { styles as page } from '@/components/connections/styles';
import { Button } from '@/components/ui';
import { useMonthStart } from '@/lib/monthStart';
import { MONTH_START_MAX, periodPreview } from '@/lib/period';
import { colors, fonts } from '@/theme';

const DAYS = Array.from({ length: MONTH_START_MAX }, (_, i) => i + 1);

// The day the month starts on, picked from a grid of days 1–28, with how this month
// looks with it before saving.
export function MonthStartPicker() {
  const { startDay, saveStartDay } = useMonthStart();
  const [picked, setPicked] = useState<number | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const day = picked ?? startDay;
  const dirty = day !== startDay;

  async function save() {
    setState('saving');
    try {
      await saveStartDay(day);
      setPicked(null);
      setState('saved');
    } catch {
      setState('error');
    }
  }

  return (
    <View style={page.card}>
      <Text style={page.bank}>Início do mês</Text>
      <Text style={page.status}>
        Para o mês seguir o salário. Começando no dia 27, novembro vai de 27 de outubro a 26 de
        novembro e leva o nome do mês em que termina. Vale para todas as telas.
      </Text>
      <Text style={styles.label}>O mês começa no dia</Text>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {DAYS.map((d) => {
          const on = d === day;
          return (
            <Pressable
              key={d}
              onPress={() => {
                setPicked(d);
                setState('idle');
              }}
              testID={`month-start-${d}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Dia ${d}`}
              style={[styles.day, on && styles.dayOn]}
            >
              <Text style={[styles.dayText, on && styles.dayTextOn]}>{d}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.preview}>
        {day === 1 ? 'Mês do calendário. ' : ''}
        {periodPreview(day)}
      </Text>
      <View style={page.actions}>
        <Button
          label="Salvar início do mês"
          primary
          onPress={save}
          disabled={!dirty}
          busy={state === 'saving'}
        />
        {state === 'saved' && !dirty ? (
          <Text style={page.result}>
            {startDay === 1
              ? 'O mês agora segue o calendário.'
              : `O mês agora começa no dia ${startDay}.`}
          </Text>
        ) : null}
      </View>
      {state === 'error' ? (
        <Text style={page.error}>Não consegui salvar. Tente de novo.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink, marginTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, maxWidth: 7 * 46 },
  day: {
    width: 40,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: { borderColor: colors.ink, backgroundColor: colors.ink },
  dayText: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  dayTextOn: { color: colors.page, fontFamily: fonts.medium },
  preview: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
});
