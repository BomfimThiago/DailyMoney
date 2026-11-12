import { useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { summary } from '@/lib/connections';
import { finishConnection } from '@/lib/imports';
import type { SyncResult } from '@/lib/types';
import { colors, fonts } from '@/theme';

type Params = { code?: string; state?: string; error?: string };

// Where the bank sends the person back after authorizing (Enable Banking): saves the
// connection and reads it right away.
export default function ConnectionReturnScreen() {
  const params = useLocalSearchParams<Params>();
  const { state } = useAuth();
  const { result, error } = useFinishConnection(params, state.status === 'signedIn');
  if (state.status === 'signedOut') return <Redirect href="/login" />;
  const refused = params.error || !params.code || !params.state;
  const shown = refused ? 'O banco não autorizou a conexão. Você pode tentar de novo.' : error;
  return (
    <View style={styles.page}>
      {shown ? <NotConnected message={shown} /> : <Reading result={result} />}
    </View>
  );
}

// The code works once, so the connection is finished a single time, after sign-in.
function useFinishConnection({ code, state }: Params, signedIn: boolean) {
  const client = useQueryClient();
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    // React may run effects twice in development.
    if (started.current || !signedIn || !code || !state) return;
    started.current = true;
    finishConnection(code, state)
      .then(async (r) => {
        setResult(r);
        await client.invalidateQueries({ queryKey: ['money'] });
      })
      .catch((e: unknown) => setError(errorText(e, 'Não deu para concluir a conexão.')));
  }, [code, state, signedIn, client]);
  return { result, error };
}

function NotConnected({ message }: { message: string }) {
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

function Reading({ result }: { result: SyncResult | null }) {
  if (!result) {
    return (
      <>
        <ActivityIndicator color={colors.ink} />
        <Text style={styles.body}>Lendo as transações do banco…</Text>
      </>
    );
  }
  return (
    <>
      <Text style={styles.title}>{result.connection.bank} conectado</Text>
      <Text style={styles.body}>{summary(result)}</Text>
      <Text style={styles.body}>A partir de agora as transações chegam todo dia às 6h.</Text>
      <Button primary label="Ver Conexões" onPress={() => router.replace('/conexoes')} />
    </>
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
