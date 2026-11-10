import { useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { summary } from '@/lib/connections';
import { finishConnection } from '@/lib/imports';
import type { SyncResult } from '@/lib/types';
import { colors, fonts } from '@/theme';

// Where the bank sends the person back after authorizing (Enable Banking): saves the
// connection and reads it right away.
export default function ConnectionReturnScreen() {
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const { state } = useAuth();
  const client = useQueryClient();
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // The code works once; React may run effects twice in development.
    if (started.current || state.status !== 'signedIn') return;
    if (!params.code || !params.state) return;
    started.current = true;
    finishConnection(params.code, params.state)
      .then(async (r) => {
        setResult(r);
        await client.invalidateQueries({ queryKey: ['money'] });
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Não deu para concluir a conexão.'),
      );
  }, [params.code, params.state, state.status, client]);

  if (state.status === 'signedOut') return <Redirect href="/login" />;
  const refused = params.error || !params.code || !params.state;
  const shown = refused ? 'O banco não autorizou a conexão. Você pode tentar de novo.' : error;

  return (
    <View style={styles.page}>
      {shown ? (
        <>
          <Text style={styles.title}>Banco não conectado</Text>
          <Text style={styles.body}>{shown}</Text>
          <Link href="/conexoes" style={styles.link}>
            Voltar para Conexões
          </Link>
        </>
      ) : result ? (
        <>
          <Text style={styles.title}>{result.connection.bank} conectado</Text>
          <Text style={styles.body}>{summary(result)}</Text>
          <Text style={styles.body}>A partir de agora as transações chegam todo dia às 6h.</Text>
          <Button primary label="Ver Conexões" onPress={() => router.replace('/conexoes')} />
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.body}>Lendo as transações do banco…</Text>
        </>
      )}
    </View>
  );
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
