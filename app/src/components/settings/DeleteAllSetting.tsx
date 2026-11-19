import { ActivityIndicator, Text, View } from 'react-native';

import { styles as page } from '@/components/connections/styles';
import { ConfirmDelete, Small, confirmStyles as styles } from '@/components/settings/ConfirmDelete';
import { errorText } from '@/lib/api';
import { purgeButton, purgeLines } from '@/lib/purge';
import { plural } from '@/lib/upload';
import { useDeleteAll } from '@/lib/useDeleteAll';
import { colors } from '@/theme';

// Ajustes: start over. Every line of every month goes; accounts, categories and
// connections stay. Asks for the word APAGAR before the button works.
export function DeleteAllSetting() {
  const d = useDeleteAll();
  return (
    <View style={page.card}>
      <Text style={page.bank}>Apagar todas as transações</Text>
      <Text style={page.status}>
        Para começar do zero: tira as transações de todos os meses e o histórico de envios.
      </Text>
      {d.removed !== null ? (
        <Text style={styles.done}>
          {plural(
            d.removed,
            'Pronto: 1 transação apagada.',
            (n) => `Pronto: ${n} transações apagadas.`,
          )}
        </Text>
      ) : null}
      {d.open ? <Confirm d={d} /> : <Small label="Apagar todas…" onPress={d.start} />}
    </View>
  );
}

function Confirm({ d }: { d: ReturnType<typeof useDeleteAll> }) {
  const o = d.overview.data;
  if (d.overview.isError) {
    return (
      <View style={styles.box}>
        <Text style={page.error}>{errorText(d.overview.error)}</Text>
        <View style={styles.actions}>
          <Small label="Fechar" onPress={d.close} />
          <Small label="Tentar de novo" onPress={() => void d.overview.refetch()} />
        </View>
      </View>
    );
  }
  if (!o) return <ActivityIndicator style={styles.box} color={colors.ink} />;
  if (o.transactions === 0) {
    return (
      <View style={styles.box}>
        <Text style={styles.text}>Não há transações para apagar.</Text>
        <View style={styles.actions}>
          <Small label="Fechar" onPress={d.close} />
        </View>
      </View>
    );
  }
  return (
    <ConfirmDelete
      lines={purgeLines(o)}
      button={purgeButton(o)}
      typed={d.typed}
      setTyped={d.setTyped}
      ready={d.ready}
      busy={d.busy}
      error={d.error}
      onCancel={d.close}
      onSubmit={() => void d.submit()}
    />
  );
}
