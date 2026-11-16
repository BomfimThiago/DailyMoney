import { Link, router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { summary } from '@/lib/connections';
import type { SyncResult } from '@/lib/types';
import { colors, fonts } from '@/theme';

// What the person sees when a bank's authorization page sends them back to the app.

export function ReturnPage({ children }: { children: ReactNode }) {
  return <View style={styles.page}>{children}</View>;
}

export function NotConnected({ message }: { message: string }) {
  return (
    <>
      <Text style={styles.title}>Banco não conectado</Text>
      <Text style={styles.body}>{message}</Text>
      <Link href="/conexoes" style={styles.link}>
        Voltar para Conexões
      </Link>
    </>
  );
}

export function Working({ text }: { text: string }) {
  return (
    <>
      <ActivityIndicator color={colors.ink} />
      <Text style={styles.body}>{text}</Text>
    </>
  );
}

export function Connected({ results }: { results: SyncResult[] }) {
  return (
    <>
      {results.map((r) => (
        <View key={r.connection.id} style={styles.bank}>
          <Text style={styles.title}>{r.connection.bank} conectado</Text>
          <Text style={styles.body}>{summary(r)}</Text>
        </View>
      ))}
      <Text style={styles.body}>A partir de agora as transações chegam todo dia às 6h.</Text>
      <SeeConnections />
    </>
  );
}

// Authorized, but the bank's data is still on its way.
export function AlmostThere({ message }: { message: string }) {
  return (
    <>
      <Text style={styles.title}>Quase lá</Text>
      <Text style={styles.body}>{message}</Text>
      <SeeConnections />
    </>
  );
}

function SeeConnections() {
  return <Button primary label="Ver Conexões" onPress={() => router.replace('/conexoes')} />;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  bank: { alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.semibold, fontSize: 20, color: colors.ink },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 420,
  },
  link: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink, marginTop: 8 },
});
