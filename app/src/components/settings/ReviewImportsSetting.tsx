import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { styles as page } from '@/components/connections/styles';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRefreshMoney } from '@/lib/queries';
import { colors, fonts } from '@/theme';

// Whether imported lines wait for approval before they count. On while the imports are
// new; the person turns it off once they trust them.
export function ReviewImportsSetting() {
  const { state } = useAuth();
  const refreshMoney = useRefreshMoney();
  const saved = state.status === 'signedIn' ? state.me.family.review_imports : true;
  const [on, setOn] = useState<boolean | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const value = on ?? saved;

  async function toggle() {
    const next = !value;
    setStatus('saving');
    try {
      await api('/family', { method: 'PATCH', body: JSON.stringify({ review_imports: next }) });
      setOn(next);
      setStatus('idle');
      await refreshMoney();
    } catch {
      setStatus('error');
    }
  }

  return (
    <View style={page.card}>
      <Text style={page.bank}>Revisar importações</Text>
      <Text style={page.status}>
        O que chega de extratos e bancos conectados fica em Transações › Para revisar e só entra nas
        contas depois que você aprovar.
      </Text>
      <Pressable
        onPress={toggle}
        disabled={status === 'saving'}
        testID="review-imports"
        accessibilityRole="switch"
        accessibilityState={{ checked: value, busy: status === 'saving' }}
        style={styles.row}
      >
        <View style={[styles.track, value && styles.trackOn]}>
          <View style={[styles.knob, value && styles.knobOn]} />
        </View>
        <Text style={styles.label}>
          {value ? 'Ligado: aprovo antes de contar' : 'Desligado: entram direto'}
        </Text>
      </Pressable>
      {status === 'error' ? (
        <Text style={page.error}>Não consegui salvar. Tente de novo.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, minHeight: 44 },
  track: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.line,
    padding: 3,
    justifyContent: 'center',
  },
  trackOn: { backgroundColor: colors.ink },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.page },
  knobOn: { alignSelf: 'flex-end' },
  label: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
});
