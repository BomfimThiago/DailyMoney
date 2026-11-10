import { Link, Redirect, router } from 'expo-router';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { WithSideBar } from '@/components/nav';
import { Button, SectionTitle, ui } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { PAGE_PAD, WIDE_MIN } from '@/lib/dashboard';
import { useAccounts } from '@/lib/queries';
import type { Account } from '@/lib/types';
import { colors, fonts } from '@/theme';

// Planned automatic connections (spec: Pluggy for Brazil, Enable Banking for Europe, the
// Wise API). None is live yet; statements are the only way in for now.
const PLANNED: { banks: string; via: string }[] = [
  { banks: 'Nubank, Inter', via: 'Brasil, via Pluggy' },
  { banks: 'Revolut, CaixaBank', via: 'Europa, via Enable Banking' },
  { banks: 'Wise', via: 'API da Wise' },
];

// Conexões: the accounts the app follows and how each one gets its data. A page of its
// own, next to Enviar extrato in the sidebar.
export default function ConnectionsScreen() {
  const { state } = useAuth();
  const wide = useWindowDimensions().width >= WIDE_MIN;
  const accounts = useAccounts(state.status === 'signedIn');

  if (state.status === 'loading') return <View style={styles.page} />;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  return (
    <WithSideBar wide={wide}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={wide ? styles.wideContent : styles.content}
      >
        <View style={styles.column}>
          {wide ? null : (
            <Link href="/" style={styles.back}>
              ‹ Início
            </Link>
          )}
          <Text style={[styles.title, wide && styles.wideTitle]}>Conexões</Text>
          <Text style={styles.lead}>
            As contas que o Daily Money acompanha. Por enquanto elas são atualizadas pelos extratos
            que você envia.
          </Text>

          <SectionTitle>Suas contas</SectionTitle>
          {accounts.isError ? (
            <Text style={styles.muted}>Não consegui carregar as contas.</Text>
          ) : !accounts.data ? (
            <ActivityIndicator color={colors.muted} />
          ) : accounts.data.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.muted}>
                Nenhuma conta ainda. Ela aparece aqui depois do primeiro extrato.
              </Text>
              <Button primary label="Enviar extrato" onPress={() => router.navigate('/upload')} />
            </View>
          ) : (
            <View style={ui.rowList}>
              {accounts.data.map((a, i) => (
                <AccountRow key={a.id} account={a} first={i === 0} />
              ))}
            </View>
          )}

          <SectionTitle>Conexão automática</SectionTitle>
          <Text style={styles.muted}>
            Com o banco conectado, as transações chegam sozinhas, sem enviar arquivo.
          </Text>
          <View style={[ui.rowList, styles.planned]}>
            {PLANNED.map((p, i) => (
              <View key={p.banks} style={[ui.row, i === 0 && ui.rowFirst, styles.line]}>
                <View style={ui.rowMain}>
                  <Text style={ui.rowTitle}>{p.banks}</Text>
                  <Text style={ui.rowSub}>{p.via}</Text>
                </View>
                <Text style={styles.soon}>Em breve</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </WithSideBar>
  );
}

function AccountRow({ account, first }: { account: Account; first: boolean }) {
  // The bank only adds something when the account's name doesn't already say it.
  const bank =
    account.bank && !account.name.toLowerCase().includes(account.bank.toLowerCase())
      ? account.bank
      : null;
  const details = [bank, account.currency, account.is_card ? 'Cartão' : 'Conta'].filter(Boolean);
  return (
    <View style={[ui.row, first && ui.rowFirst, styles.line]}>
      <View style={ui.rowMain}>
        <Text style={ui.rowTitle} numberOfLines={1}>
          {account.name}
        </Text>
        <Text style={ui.rowSub}>{details.join(' · ')}</Text>
      </View>
      <Text style={styles.via}>Por extrato</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 48, alignItems: 'center' },
  wideContent: { paddingHorizontal: PAGE_PAD, paddingTop: 28, paddingBottom: 48 },
  column: { width: '100%', maxWidth: 640 },
  back: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, paddingVertical: 4 },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 24,
    letterSpacing: -0.2,
    color: colors.ink,
    marginTop: 8,
  },
  wideTitle: { marginTop: 0, fontSize: 20, letterSpacing: 0 },
  lead: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    marginTop: 8,
  },
  muted: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.muted },
  empty: { gap: 12, alignItems: 'flex-start' },
  line: { alignItems: 'center' },
  via: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  planned: { marginTop: 12 },
  soon: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    backgroundColor: colors.soft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
});
