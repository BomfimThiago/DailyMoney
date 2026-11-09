import { Redirect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { GoogleButton } from '@/components/GoogleButton';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, fonts } from '@/theme';

export default function LoginScreen() {
  const { state, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onIdToken = useCallback(
    (idToken: string) => {
      setBusy(true);
      setError(null);
      signInWithGoogle(idToken)
        .catch((e: unknown) =>
          setError(e instanceof ApiError ? e.message : 'Não foi possível entrar'),
        )
        .finally(() => setBusy(false));
    },
    [signInWithGoogle],
  );

  if (state.status === 'signedIn') return <Redirect href="/" />;

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.brand}>Daily Money</Text>
        <Text style={styles.tagline}>Para onde vai o dinheiro da família, em real, dólar e euro.</Text>
        <View style={styles.action}>
          {busy ? <ActivityIndicator color={colors.ink} /> : <GoogleButton onIdToken={onIdToken} />}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: { width: '100%', maxWidth: 360, alignItems: 'center' },
  brand: { fontFamily: fonts.semibold, fontSize: 28, color: colors.ink, letterSpacing: -0.3 },
  tagline: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  action: { marginTop: 40, minHeight: 44, justifyContent: 'center' },
  error: { fontFamily: fonts.regular, color: colors.danger, marginTop: 16, textAlign: 'center' },
});
