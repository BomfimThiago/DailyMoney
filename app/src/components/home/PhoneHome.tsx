import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { CurrencyChips } from '@/components/CurrencyChips';
import { MonthNav } from '@/components/nav';
import { Loadable } from '@/components/states';
import { TxRow } from '@/components/TxRow';
import { Button, SectionTitle } from '@/components/ui';
import { money, plain } from '@/lib/format';
import { hasNoAccounts } from '@/lib/home';
import { useRecent } from '@/lib/queries';
import type { CurrencySummary, MonthSummary, TransactionPage } from '@/lib/types';

import { type Home, CurrencyHint, NoAccounts, PendingLink } from './shared';
import { phone as styles } from './styles';

// Início on a phone: variant A from the validated mock (Entradas · Gastos · Investido and
// the latest lines).
export function PhoneHome({ home, signOut }: { home: Home; signOut: () => void }) {
  const noAccounts = hasNoAccounts(home.summary);
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.head}>
            <MonthNav month={home.month} onChange={home.setMonth} />
            <CurrencyChips
              currencies={home.summary?.currencies ?? []}
              current={home.shown?.currency}
              onChange={home.setCurrency}
              style={styles.chips}
            />
          </View>
          <Loadable
            isError={home.isError}
            loading={!home.summary}
            value={home.summary}
            empty=""
            textStyle={[styles.empty, styles.loading]}
          >
            {(summary) =>
              noAccounts ? (
                <NoAccounts name={home.name} style={styles.emptyBox} />
              ) : (
                <MonthFigures summary={summary} shown={home.shown} />
              )
            }
          </Loadable>
          <PendingLink count={home.summary?.pending_transfers ?? 0} style={styles.pending} />
          {noAccounts ? null : <Recent month={home.month} />}
          <Pressable onPress={signOut} style={styles.signOut} accessibilityRole="button">
            <Text style={styles.signOutText}>Sair</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function MonthFigures({
  summary,
  shown,
}: {
  summary: MonthSummary;
  shown: CurrencySummary | null;
}) {
  if (!shown) return null;
  return (
    <>
      <View style={styles.numbers}>
        <Figure label="Entradas" value={plain(shown.income)} tone="income" />
        <Figure label="Gastos" value={plain(shown.spending)} divider />
        <Figure label="Investido" value={plain(shown.invested)} tone="invest" divider />
      </View>
      <View style={styles.left}>
        <Text style={styles.leftLabel}>Sobrou no mês</Text>
        <Text style={styles.leftValue}>{money(shown.left, shown.currency)}</Text>
      </View>
      <CurrencyHint summary={summary} shown={shown} style={styles.hint} />
    </>
  );
}

function Figure({
  label,
  value,
  tone,
  divider,
}: {
  label: string;
  value: string;
  tone?: 'income' | 'invest';
  divider?: boolean;
}) {
  return (
    <View style={[styles.figure, divider && styles.divider]}>
      <Text style={styles.figureLabel}>{label.toUpperCase()}</Text>
      <Text
        style={[styles.figureValue, tone && styles[tone]]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

function Recent({ month }: { month: string }) {
  const query = useRecent(month, true);
  return (
    <>
      <SectionTitle>Últimos movimentos</SectionTitle>
      <Loadable
        isError={query.isError}
        loading={!query.data}
        value={query.data?.items.length ? query.data : null}
        empty="Nenhum movimento neste mês."
        error="Não consegui carregar os movimentos."
        textStyle={styles.empty}
      >
        {(page) => <RecentLines page={page} />}
      </Loadable>
      <Button label="Enviar extrato" onPress={() => router.push('/upload')} style={styles.upload} />
    </>
  );
}

function RecentLines({ page }: { page: TransactionPage }) {
  return (
    <View>
      {page.items.map((t, i) => (
        <TxRow key={t.id} t={t} first={i === 0} />
      ))}
      {page.total > page.items.length ? (
        <Pressable
          onPress={() => router.navigate('/transacoes')}
          accessibilityRole="link"
          style={styles.more}
        >
          <Text style={styles.moreText}>Ver todas as {page.total}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
