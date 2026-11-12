import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, fonts } from '@/theme';

// Target of the e-mailed link: trades the one-time token for a session.
export default function EnterScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { state, signInWithLink } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // The token is single use; React may run effects twice in development.
    if (started.current || state.status === 'loading') return;
    if (!token) return;
    started.current = true;
    signInWithLink(token).catch((e: unknown) => setError(errorText(e, 'Não foi possível entrar')));
  }, [token, state.status, signInWithLink]);

  if (state.status === 'signedIn') return <Redirect href="/" />;
  const shown = token ? error : 'Link incompleto. Peça um novo.';

  return (
    <View style={styles.page}>
      {shown ? (
        <>
          <Text style={styles.title}>Não deu para entrar</Text>
          <Text style={styles.body}>{shown}</Text>
          <Link href="/login" style={styles.link}>
            Pedir outro link
          </Link>
        </>
      ) : (
        <ActivityIndicator color={colors.ink} />
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
  },
  title: { fontFamily: fonts.semibold, fontSize: 20, color: colors.ink },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.muted,
    marginTop: 8,
    textAlign: 'center',
  },
  link: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink, marginTop: 24 },
});
