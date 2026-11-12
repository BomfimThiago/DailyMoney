// The states every signed-in page goes through: the session, then its data.
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
} from 'react-native';

import { useAuth } from '@/lib/auth';
import { colors, fonts } from '@/theme';

export const LOAD_ERROR = 'Não consegui carregar. Tente de novo.';

// The page itself only mounts once the person is signed in, so its queries can always run.
export function SignedIn({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'loading') return <View style={styles.page} />;
  if (state.status === 'signedOut') return <Redirect href="/login" />;
  return children;
}

export function Loadable<T>({
  isError,
  loading,
  value,
  empty,
  error = LOAD_ERROR,
  textStyle = styles.text,
  children,
}: {
  isError: boolean;
  loading: boolean;
  value: T | null | undefined;
  empty: string;
  error?: string;
  textStyle?: StyleProp<TextStyle>;
  children: (value: T) => ReactNode;
}) {
  if (isError) return <Text style={textStyle}>{error}</Text>;
  if (loading) return <ActivityIndicator color={colors.muted} style={styles.loading} />;
  if (value === null || value === undefined) return <Text style={textStyle}>{empty}</Text>;
  return children(value);
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  loading: { marginVertical: 32 },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.muted },
});
