import { Link, Redirect, useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { SupportedBanks } from '@/components/SupportedBanks';
import { History } from '@/components/upload/Done';
import { styles } from '@/components/upload/styles';
import { UploadFlow } from '@/components/upload/UploadFlow';
import { useAuth } from '@/lib/auth';
import { WIDE_MIN } from '@/lib/dashboard';
import { useAccounts, useImports } from '@/lib/queries';
import type { ImportSummary } from '@/lib/types';
import { useUploadFlow } from '@/lib/useUploadFlow';
import { colors } from '@/theme';

export default function UploadScreen() {
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';
  const flow = useUploadFlow();
  const accounts = useAccounts(signedIn).data ?? [];
  const history = useImports(signedIn).data ?? [];
  const wide = useWindowDimensions().width >= WIDE_MIN;

  // The page stays mounted between visits: once a statement is in, leaving the page
  // starts the next visit fresh. A statement still being reviewed is kept.
  const { done, reset } = flow;
  useFocusEffect(
    useCallback(
      () => () => {
        if (done) reset();
      },
      [done, reset],
    ),
  );

  if (state.status === 'loading') {
    return (
      <View style={[styles.page, styles.center]}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const Layout = wide ? WideLayout : PhoneLayout;
  return (
    <Layout history={history}>
      <UploadFlow flow={flow} accounts={accounts} />
    </Layout>
  );
}

type LayoutProps = { history: ImportSummary[]; children: ReactNode };

// On a computer: the upload flow, and next to it what was sent before and which banks
// the app can read.
function WideLayout({ history, children }: LayoutProps) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.wideContent}>
      <Text style={[styles.title, styles.wideTitle]}>Enviar extrato</Text>
      <View style={styles.wideRow}>
        <View style={styles.wideMain}>{children}</View>
        <View style={styles.aside}>
          <SupportedBanks />
          <History items={history} />
        </View>
      </View>
    </ScrollView>
  );
}

function PhoneLayout({ history, children }: LayoutProps) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Link href="/" style={styles.back}>
          ‹ Início
        </Link>
        <Text style={styles.title}>Enviar extrato</Text>
        {children}
        <SupportedBanks />
        <History items={history} />
      </View>
    </ScrollView>
  );
}
