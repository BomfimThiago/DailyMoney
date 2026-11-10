import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { Button, SectionTitle, ui } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PAGE_PAD, WIDE_MIN } from '@/lib/dashboard';
import { daysUntil, localDay, summary, when } from '@/lib/connections';
import { fullDate } from '@/lib/format';
import { disconnectBank, startConnection, syncConnection } from '@/lib/imports';
import { useAccounts, useConnections } from '@/lib/queries';
import type { Account, Connection, SyncResult } from '@/lib/types';
import { colors, fonts } from '@/theme';

// Brazilian banks are authorized in Meu Pluggy's own app, not from here.
const BRAZIL_BANKS = 'Nubank, Inter';
// An authorization this close to its end gets a warning.
const WARN_DAYS = 14;

// Conexões: the banks read automatically every morning, the banks that can still be
// connected, and every account the app follows with how its data arrives.
export default function ConnectionsScreen() {
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';
  const wide = useWindowDimensions().width >= WIDE_MIN;
  const overview = useConnections(signedIn);
  const accounts = useAccounts(signedIn);
  const [opening, setOpening] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  if (state.status === 'loading') return <View style={styles.page} />;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const connections = overview.data?.connections ?? [];
  const connected = new Set(connections.map((c) => c.bank));
  const automatic = new Map<string, string>();
  for (const c of connections) {
    for (const a of c.accounts) if (a.account_id) automatic.set(a.account_id, c.bank);
  }

  async function connect(bank: string) {
    setOpening(bank);
    setStartError(null);
    try {
      const { url } = await startConnection(bank);
      // The bank's page brings the person back to /conexoes/retorno.
      if (Platform.OS === 'web') window.location.assign(url);
      else await Linking.openURL(url);
    } catch (e) {
      setStartError(e instanceof ApiError ? e.message : 'Não deu para abrir o banco.');
      setOpening(null);
    }
  }

  return (
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
          Bancos conectados mandam as transações sozinhos, todo dia às 6h. As outras contas são
          atualizadas pelos extratos que você envia.
        </Text>

        {overview.isError ? (
          <Text style={[styles.muted, styles.gap]}>Não consegui carregar as conexões.</Text>
        ) : !overview.data ? (
          <ActivityIndicator style={styles.gap} color={colors.muted} />
        ) : (
          <>
            {connections.length > 0 ? (
              <>
                <SectionTitle>Bancos conectados</SectionTitle>
                <View style={styles.cards}>
                  {connections.map((c) => (
                    <ConnectionCard
                      key={c.id}
                      connection={c}
                      onReconnect={
                        c.provider === 'enablebanking' ? () => void connect(c.bank) : undefined
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}

            <SectionTitle>Conectar um banco</SectionTitle>
            <View style={ui.rowList}>
              {overview.data.european_banks.map((bank, i) => (
                <View key={bank} style={[ui.row, i === 0 && ui.rowFirst, styles.line]}>
                  <View style={ui.rowMain}>
                    <Text style={ui.rowTitle}>{bank}</Text>
                    <Text style={ui.rowSub}>Europa · autorização pelo próprio banco</Text>
                  </View>
                  {connected.has(bank) ? (
                    <Text style={styles.done}>Conectado</Text>
                  ) : (
                    <Button
                      label="Conectar"
                      busy={opening === bank}
                      disabled={opening !== null}
                      onPress={() => void connect(bank)}
                    />
                  )}
                </View>
              ))}
              {overview.data.european_banks.length === 0 ? (
                <View style={[ui.row, ui.rowFirst, styles.line]}>
                  <View style={ui.rowMain}>
                    <Text style={ui.rowTitle}>Wise, Revolut, CaixaBank</Text>
                    <Text style={ui.rowSub}>Europa, via Enable Banking</Text>
                  </View>
                  <Text style={styles.soon}>Falta configurar</Text>
                </View>
              ) : null}
              <View style={[ui.row, styles.line]}>
                <View style={ui.rowMain}>
                  <Text style={ui.rowTitle}>{BRAZIL_BANKS}</Text>
                  <Text style={ui.rowSub}>
                    {overview.data.brazil_ready
                      ? 'Brasil · autorize no app Meu Pluggy; eles aparecem aqui sozinhos'
                      : 'Brasil, via Meu Pluggy'}
                  </Text>
                </View>
                {overview.data.brazil_ready ? (
                  <Pressable onPress={() => void Linking.openURL('https://meu.pluggy.ai')}>
                    <Text style={styles.link}>Abrir Meu Pluggy</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.soon}>Falta configurar</Text>
                )}
              </View>
            </View>
            {startError ? <Text style={styles.error}>{startError}</Text> : null}
          </>
        )}

        <SectionTitle>Suas contas</SectionTitle>
        {accounts.isError ? (
          <Text style={styles.muted}>Não consegui carregar as contas.</Text>
        ) : !accounts.data ? (
          <ActivityIndicator color={colors.muted} />
        ) : accounts.data.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.muted}>
              Nenhuma conta ainda. Ela aparece aqui depois do primeiro extrato ou da primeira
              conexão.
            </Text>
            <Button primary label="Enviar extrato" onPress={() => router.navigate('/upload')} />
          </View>
        ) : (
          <View style={ui.rowList}>
            {accounts.data.map((a, i) => (
              <AccountRow key={a.id} account={a} first={i === 0} via={automatic.get(a.id)} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function ConnectionCard({
  connection: c,
  onReconnect,
}: {
  connection: Connection;
  onReconnect?: () => void;
}) {
  const client = useQueryClient();
  const [result, setResult] = useState<SyncResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: ['money'] });
  const sync = useMutation({
    mutationFn: () => syncConnection(c.id),
    onSuccess: (r) => {
      setResult(r);
      return refresh();
    },
  });
  const remove = useMutation({ mutationFn: () => disconnectBank(c.id), onSuccess: refresh });

  const expiring = c.consent_expires_at ? daysUntil(c.consent_expires_at) : null;
  const failed = sync.error instanceof ApiError ? sync.error.message : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={ui.rowMain}>
          <Text style={styles.bank}>{c.bank}</Text>
          <Text style={ui.rowSub}>
            {c.accounts.length === 0
              ? 'Nenhuma conta lida ainda'
              : c.accounts.map((a) => a.name).join(' · ')}
          </Text>
        </View>
        <Text style={styles.via}>{c.provider === 'pluggy' ? 'Meu Pluggy' : 'Enable Banking'}</Text>
      </View>

      <Text style={styles.status}>
        {c.last_sync_at ? `Atualizado ${when(c.last_sync_at)}` : 'Ainda não sincronizado'}
        {c.consent_expires_at
          ? ` · autorizado até ${fullDate(localDay(c.consent_expires_at))}`
          : ''}
      </Text>
      {expiring !== null && expiring <= WARN_DAYS ? (
        <Text style={styles.warn}>
          {expiring <= 0
            ? 'A autorização venceu. Conecte de novo para continuar recebendo as transações.'
            : `A autorização vence em ${expiring} ${expiring === 1 ? 'dia' : 'dias'}.`}
        </Text>
      ) : null}
      {c.last_error ? <Text style={styles.error}>{c.last_error}</Text> : null}
      {failed ? <Text style={styles.error}>{failed}</Text> : null}
      {result ? <Text style={styles.result}>{summary(result)}</Text> : null}

      <View style={styles.actions}>
        {confirming ? (
          <>
            <Text style={styles.ask}>Parar de ler o {c.bank}? As transações ficam.</Text>
            <Button label="Cancelar" onPress={() => setConfirming(false)} />
            <Button label="Desconectar" busy={remove.isPending} onPress={() => remove.mutate()} />
          </>
        ) : (
          <>
            <Button
              primary
              label="Sincronizar agora"
              busy={sync.isPending}
              onPress={() => sync.mutate()}
            />
            {onReconnect && (c.last_error || (expiring !== null && expiring <= WARN_DAYS)) ? (
              <Button label="Conectar de novo" onPress={onReconnect} />
            ) : null}
            <Pressable onPress={() => setConfirming(true)} hitSlop={8}>
              <Text style={styles.quiet}>Desconectar</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function AccountRow({ account, first, via }: { account: Account; first: boolean; via?: string }) {
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
      {via ? (
        <Text style={styles.auto}>Automática</Text>
      ) : (
        <Text style={styles.via}>Por extrato</Text>
      )}
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
  gap: { marginTop: 24 },
  muted: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.muted },
  empty: { gap: 12, alignItems: 'flex-start' },
  line: { alignItems: 'center' },
  cards: { gap: 12 },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bank: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  status: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  warn: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.pendingText },
  error: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.danger,
    marginTop: 4,
  },
  result: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.positive },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  ask: { fontFamily: fonts.regular, fontSize: 13, color: colors.ink, flexBasis: '100%' },
  quiet: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, paddingHorizontal: 4 },
  link: { fontFamily: fonts.medium, fontSize: 13, color: colors.invest },
  via: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  auto: { fontFamily: fonts.medium, fontSize: 13, color: colors.positive },
  done: { fontFamily: fonts.medium, fontSize: 13, color: colors.positive },
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
