import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, SectionTitle, ui } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isIncome, money, shortDate } from '@/lib/format';
import { listTransactions } from '@/lib/imports';
import type { TransactionPage } from '@/lib/types';
import { colors, fonts } from '@/theme';

// Until the Início screen from the mockups is built: greeting, upload and the latest rows.
export default function HomeScreen() {
  const { state, signOut } = useAuth();
  const [page, setPage] = useState<TransactionPage | null>(null);
  const signedIn = state.status === 'signedIn';

  useFocusEffect(
    useCallback(() => {
      if (signedIn) listTransactions(20).then(setPage, () => setPage({ total: 0, items: [] }));
    }, [signedIn]),
  );

  if (state.status === 'loading') {
    return (
      <View style={[styles.page, styles.center]}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const { me } = state;
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Text style={styles.label}>{me.family.name.toUpperCase()}</Text>
        <Text style={styles.title}>Olá, {me.name.split(' ')[0]}</Text>

        <Button
          primary
          label="Enviar extrato"
          onPress={() => router.push('/upload')}
          style={styles.upload}
        />

        <SectionTitle>
          {page && page.total > page.items.length
            ? `Últimas transações · ${page.total} no total`
            : 'Últimas transações'}
        </SectionTitle>
        {!page ? (
          <ActivityIndicator color={colors.muted} />
        ) : page.items.length === 0 ? (
          <Text style={styles.empty}>
            Nenhuma transação ainda. Envie o extrato de uma conta ou cartão para começar.
          </Text>
        ) : (
          <View style={ui.rowList}>
            {page.items.map((t, i) => (
              <View key={t.id} style={[ui.row, i === 0 && ui.rowFirst]}>
                <Text style={ui.rowDate}>{shortDate(t.date)}</Text>
                <View style={ui.rowMain}>
                  <Text style={ui.rowTitle} numberOfLines={1}>
                    {t.description}
                  </Text>
                  <Text style={ui.rowSub} numberOfLines={1}>
                    {[t.category_name, t.account_name].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text
                  style={[
                    ui.rowAmount,
                    isIncome(t.amount) && !t.is_transfer && ui.income,
                    t.is_transfer && styles.transfer,
                  ]}
                >
                  {money(t.amount, t.currency, true)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Pressable onPress={signOut} style={styles.signOut} accessibilityRole="button">
          <Text style={styles.signOutText}>Sair</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 48, alignItems: 'center' },
  column: { width: '100%', maxWidth: 520 },
  label: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.2, color: colors.muted },
  title: { fontFamily: fonts.semibold, fontSize: 26, color: colors.ink, marginTop: 6 },
  upload: { marginTop: 24 },
  empty: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.muted },
  transfer: { color: colors.muted },
  signOut: { marginTop: 32, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  signOutText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
});
