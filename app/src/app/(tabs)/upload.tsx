import * as DocumentPicker from 'expo-document-picker';
import { Link, Redirect, router, useFocusEffect } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { SupportedBanks } from '@/components/SupportedBanks';
import { Button, Card, Chip, SectionTitle, ui } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PAGE_PAD, WIDE_MIN } from '@/lib/dashboard';
import {
  addDays,
  dayMonth,
  daysBetween,
  fullDate,
  initials,
  isIncome,
  money,
  period,
  shortDate,
} from '@/lib/format';
import {
  cancelImport,
  confirmImport,
  refreshPreview,
  uploadStatement,
  type PickedFile,
} from '@/lib/imports';
import { useAccounts, useImports, useRefreshMoney } from '@/lib/queries';
import type {
  Account,
  AccountChoice,
  Currency,
  GroupCounts,
  ImportPreview,
  ImportSummary,
  PreviewGroup,
  PreviewRow,
} from '@/lib/types';
import { colors, fonts } from '@/theme';

type Choice = { kind: 'existing'; id: string } | { kind: 'new'; name: string };

const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR'];
const ROWS_SHOWN = 25;
const ACCEPT = [
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/x-ofx',
  'application/ofx',
  'application/pdf',
  'application/octet-stream',
  '.csv',
  '.ofx',
  '.xlsx',
  '.pdf',
];

function message(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Algo deu errado. Tente de novo.';
}

function initialChoices(preview: ImportPreview): Partial<Record<Currency, Choice>> {
  const out: Partial<Record<Currency, Choice>> = {};
  for (const g of preview.groups) {
    out[g.currency] = g.account
      ? { kind: 'existing', id: g.account.id }
      : { kind: 'new', name: g.suggested_name };
  }
  return out;
}

function totals(groups: PreviewGroup[]): GroupCounts {
  return groups.reduce(
    (acc, g) => ({
      new: acc.new + g.counts.new,
      duplicate: acc.duplicate + g.counts.duplicate,
      skipped: acc.skipped + g.counts.skipped,
    }),
    { new: 0, duplicate: 0, skipped: 0 },
  );
}

export default function UploadScreen() {
  const { state } = useAuth();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Partial<Record<Currency, Choice>>>({});
  const [since, setSince] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ImportSummary | null>(null);
  const request = useRef(0);
  const wide = useWindowDimensions().width >= WIDE_MIN;

  const signedIn = state.status === 'signedIn';

  const accounts = useAccounts(signedIn).data ?? [];
  const history = useImports(signedIn).data ?? [];
  // A new import changes every money screen, not just the lists here.
  const loadLists = useRefreshMoney();

  const reset = () => {
    setFile(null);
    setPreview(null);
    setChoices({});
    setSince(null);
    setError(null);
    setDone(null);
  };

  // The page stays mounted between visits: once a statement is in, leaving the page
  // starts the next visit fresh. A statement still being reviewed is kept.
  useFocusEffect(
    useCallback(
      () => () => {
        if (done) reset();
      },
      [done],
    ),
  );

  const read = async (picked: PickedFile, currency?: Currency) => {
    setFile(picked);
    setPreview(null);
    setDone(null);
    setError(null);
    setSince(null);
    setReading(true);
    try {
      const result = await uploadStatement(picked, currency);
      setPreview(result);
      setChoices(initialChoices(result));
    } catch (e) {
      setError(message(e));
    } finally {
      setReading(false);
    }
  };

  const pick = async () => {
    if (reading || importing) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: ACCEPT,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    await read({ name: asset.name, uri: asset.uri, mimeType: asset.mimeType, file: asset.file });
  };

  const chooseCurrency = async (currency: Currency) => {
    if (!file) return;
    // The first try created an empty import; close it before sending again.
    if (preview) cancelImport(preview.id).catch(() => undefined);
    await read(file, currency);
  };

  const refresh = async (next: Partial<Record<Currency, Choice>>, nextSince: string | null) => {
    if (!preview) return;
    const id = ++request.current;
    const body: Partial<Record<Currency, string | null>> = {};
    for (const [currency, c] of Object.entries(next) as [Currency, Choice][]) {
      body[currency] = c.kind === 'existing' ? c.id : null;
    }
    setRefreshing(true);
    try {
      const result = await refreshPreview(preview.id, body, nextSince);
      if (id === request.current) setPreview(result);
    } catch (e) {
      if (id === request.current) setError(message(e));
    } finally {
      if (id === request.current) setRefreshing(false);
    }
  };

  const selectAccount = (currency: Currency, choice: Choice) => {
    const next = { ...choices, [currency]: choice };
    setChoices(next);
    void refresh(next, since);
  };

  const renameNew = (currency: Currency, name: string) => {
    setChoices({ ...choices, [currency]: { kind: 'new', name } });
  };

  const selectSince = (value: string | null) => {
    setSince(value);
    void refresh(choices, value);
  };

  const cancel = async () => {
    if (preview) await cancelImport(preview.id).catch(() => undefined);
    reset();
    loadLists();
  };

  const submit = async () => {
    if (!preview) return;
    const body: AccountChoice[] = preview.groups.map((g) => {
      const c = choices[g.currency];
      return c?.kind === 'existing'
        ? { currency: g.currency, account_id: c.id }
        : { currency: g.currency, new_account: { name: (c?.name ?? g.suggested_name).trim() } };
    });
    setImporting(true);
    setError(null);
    try {
      const summary = await confirmImport(preview.id, body, since);
      setDone(summary);
      setPreview(null);
      setFile(null);
      loadLists();
    } catch (e) {
      setError(message(e));
    } finally {
      setImporting(false);
    }
  };

  if (state.status === 'loading') {
    return (
      <View style={[styles.page, styles.center]}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const count = preview ? totals(preview.groups) : null;
  const toImport = count ? count.new : 0;
  const namesOk = preview
    ? preview.groups.every((g) => {
        const c = choices[g.currency];
        return c?.kind !== 'new' || c.name.trim().length > 0;
      })
    : false;

  const flow = (
    <>
      {done ? (
        <Done summary={done} onAgain={reset} />
      ) : (
        <>
          {!preview || preview.needs_currency ? (
            <DropZone onPick={pick} onFile={(f) => void read(f)} reading={reading} />
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {preview?.needs_currency ? (
            <Card style={styles.gap}>
              <Text style={styles.cardTitle}>Em que moeda está este extrato?</Text>
              <Text style={styles.note}>
                O arquivo {preview.filename} não diz a moeda dos valores.
              </Text>
              <View style={styles.chips}>
                {CURRENCIES.map((c) => (
                  <Chip key={c} label={c} selected={false} onPress={() => void chooseCurrency(c)} />
                ))}
              </View>
            </Card>
          ) : null}

          {preview && count && !preview.needs_currency ? (
            <>
              <FileCard preview={preview} count={count} refreshing={refreshing} />

              {preview.groups.map((g) => (
                <AccountPicker
                  key={g.currency}
                  group={g}
                  many={preview.groups.length > 1}
                  accounts={accounts.filter((a) => a.currency === g.currency)}
                  choice={choices[g.currency]}
                  onSelect={(c) => selectAccount(g.currency, c)}
                  onRename={(name) => renameNew(g.currency, name)}
                />
              ))}

              {preview.groups.some((g) => g.first_import) ? (
                <SincePicker preview={preview} since={since} onSelect={selectSince} />
              ) : null}

              <Rows rows={preview.rows} />

              <View style={styles.actions}>
                <Button label="Cancelar" onPress={() => void cancel()} style={styles.flex1} />
                <Button
                  primary
                  label={
                    toImport === 0
                      ? 'Nada novo para importar'
                      : `Importar ${toImport} ${toImport === 1 ? 'transação' : 'transações'}`
                  }
                  onPress={() => void submit()}
                  disabled={toImport === 0 || !namesOk || refreshing}
                  busy={importing}
                  style={styles.flex2}
                />
              </View>
            </>
          ) : null}
        </>
      )}
    </>
  );

  // On a computer: the sidebar, the upload flow, and next to it what was sent before and
  // which banks the app can read.
  if (wide) {
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.wideContent}>
        <Text style={[styles.title, styles.wideTitle]}>Enviar extrato</Text>
        <View style={styles.wideRow}>
          <View style={styles.wideMain}>{flow}</View>
          <View style={styles.aside}>
            <SupportedBanks />
            <History items={history} />
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        <Link href="/" style={styles.back}>
          ‹ Início
        </Link>
        <Text style={styles.title}>Enviar extrato</Text>
        {flow}
        <SupportedBanks />
        <History items={history} />
      </View>
    </ScrollView>
  );
}

function DropZone({
  onPick,
  onFile,
  reading,
}: {
  onPick: () => void;
  onFile: (file: PickedFile) => void;
  reading: boolean;
}) {
  const ref = useRef<ComponentRef<typeof Pressable>>(null);
  const [over, setOver] = useState(false);

  // Drag and drop only exists on web; the View renders as a div there.
  useEffect(() => {
    if (Platform.OS !== 'web' || !ref.current) return;
    const node = ref.current as unknown as HTMLElement;
    const enter = (e: DragEvent) => {
      e.preventDefault();
      setOver(true);
    };
    const leave = () => setOver(false);
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) onFile({ name: f.name, uri: '', mimeType: f.type, file: f });
    };
    node.addEventListener('dragover', enter);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragover', enter);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, [onFile]);

  return (
    <Pressable
      ref={ref}
      onPress={onPick}
      disabled={reading}
      accessibilityRole="button"
      accessibilityLabel="Escolher arquivo do extrato"
      style={[styles.drop, over && styles.dropOver]}
    >
      {reading ? (
        <>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.dropTitle}>Lendo o arquivo…</Text>
        </>
      ) : (
        <>
          <View style={styles.dropIcon}>
            <Text style={styles.dropArrow}>↑</Text>
          </View>
          <Text style={styles.dropTitle}>
            {Platform.OS === 'web'
              ? 'Arraste o arquivo ou clique para escolher'
              : 'Toque para escolher o arquivo'}
          </Text>
          <Text style={styles.dropSub}>CSV, OFX, XLSX ou PDF</Text>
        </>
      )}
    </Pressable>
  );
}

function FileCard({
  preview,
  count,
  refreshing,
}: {
  preview: ImportPreview;
  count: GroupCounts;
  refreshing: boolean;
}) {
  const [showErrors, setShowErrors] = useState(false);
  const details = [
    preview.bank,
    preview.is_card ? 'Cartão' : null,
    preview.groups.map((g) => g.currency).join(' + '),
    period(preview.period_start, preview.period_end),
  ].filter(Boolean);

  const notes: string[] = [];
  if (count.duplicate) {
    notes.push(
      count.duplicate === 1
        ? '1 transação já estava no app e vai ser pulada.'
        : `${count.duplicate} transações já estavam no app e vão ser puladas.`,
    );
  }
  const pending = preview.rows.filter((r) => r.status === 'new' && r.kind === 'pending').length;
  if (pending) {
    notes.push(
      pending === 1
        ? '1 parece ir para uma conta sua: confirme depois em Transferências.'
        : `${pending} parecem ir para contas suas: confirme depois em Transferências.`,
    );
  }
  if (count.skipped) {
    notes.push(
      count.skipped === 1
        ? '1 fica de fora por ser anterior à data escolhida.'
        : `${count.skipped} ficam de fora por serem anteriores à data escolhida.`,
    );
  }

  return (
    <Card style={styles.gap}>
      <View style={styles.fileHead}>
        <View style={styles.bankIcon}>
          <Text style={styles.bankIconText}>{initials(preview.bank ?? preview.filename)}</Text>
        </View>
        <View style={ui.rowMain}>
          <Text style={styles.fileName} numberOfLines={1}>
            {preview.filename}
          </Text>
          <Text style={ui.rowSub}>{details.join(' · ')}</Text>
        </View>
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.muted} />
        ) : (
          <Text style={styles.ok}>Lido</Text>
        )}
      </View>

      <View style={styles.stats}>
        <Stat value={count.new} label={count.new === 1 ? 'nova' : 'novas'} positive />
        <Stat value={count.duplicate} label="já existiam" />
      </View>

      {notes.length ? <Text style={styles.note}>{notes.join(' ')}</Text> : null}

      {preview.errors.length ? (
        <View style={styles.errorsBox}>
          <Pressable onPress={() => setShowErrors(!showErrors)} accessibilityRole="button">
            <Text style={styles.warn}>
              {preview.errors.length === 1
                ? '1 linha não foi lida'
                : `${preview.errors.length} linhas não foram lidas`}
              {showErrors ? ' · esconder' : ' · ver quais'}
            </Text>
          </Pressable>
          {showErrors
            ? preview.errors.slice(0, 50).map((e) => (
                <Text key={e.row} style={styles.errorLine}>
                  Linha {e.row}: {e.message}
                </Text>
              ))
            : null}
        </View>
      ) : null}
    </Card>
  );
}

function Stat({ value, label, positive }: { value: number; label: string; positive?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, positive && value > 0 && ui.income]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AccountPicker({
  group,
  many,
  accounts,
  choice,
  onSelect,
  onRename,
}: {
  group: PreviewGroup;
  many: boolean;
  accounts: Account[];
  choice: Choice | undefined;
  onSelect: (c: Choice) => void;
  onRename: (name: string) => void;
}) {
  const isNew = choice?.kind === 'new';
  return (
    <View>
      <SectionTitle>{many ? `Conta das transações em ${group.currency}` : 'Conta'}</SectionTitle>
      <View style={styles.chips}>
        {accounts.map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            selected={choice?.kind === 'existing' && choice.id === a.id}
            onPress={() => onSelect({ kind: 'existing', id: a.id })}
          />
        ))}
        <Chip
          label={accounts.length ? 'Nova conta' : 'Criar conta'}
          selected={isNew}
          onPress={() => {
            if (!isNew) onSelect({ kind: 'new', name: group.suggested_name });
          }}
        />
      </View>
      {isNew ? (
        <TextInput
          value={choice.name}
          onChangeText={onRename}
          placeholder="Nome da conta"
          placeholderTextColor={colors.muted}
          maxLength={80}
          style={styles.input}
          accessibilityLabel={`Nome da nova conta em ${group.currency}`}
        />
      ) : null}
    </View>
  );
}

function SincePicker({
  preview,
  since,
  onSelect,
}: {
  preview: ImportPreview;
  since: string | null;
  onSelect: (value: string | null) => void;
}) {
  const { period_start: start, period_end: end } = preview;
  if (!start || !end) return null;
  const span = daysBetween(start, end);
  const options: { label: string; value: string | null }[] = [
    { label: `Tudo, desde ${dayMonth(start)}`, value: null },
  ];
  if (span > 95) options.push({ label: 'Últimos 3 meses', value: addDays(end, -90) });
  if (span > 35) options.push({ label: 'Último mês', value: addDays(end, -30) });
  if (options.length === 1) return null;
  return (
    <View>
      <SectionTitle>Importar a partir de</SectionTitle>
      <View style={styles.chips}>
        {options.map((o) => (
          <Chip
            key={o.label}
            label={o.label}
            selected={since === o.value}
            onPress={() => onSelect(o.value)}
          />
        ))}
      </View>
      {since ? (
        <Text style={[styles.note, styles.gapSmall]}>
          Primeira vez nesta conta: só entra o que é de {fullDate(since)} em diante.
        </Text>
      ) : null}
    </View>
  );
}

const TAGS: Record<Exclude<PreviewRow['status'], 'new'>, string> = {
  duplicate: 'já existe',
  skipped: 'fora do período',
};

const KIND_LABELS: Record<Exclude<PreviewRow['kind'], 'regular'>, string> = {
  investment: 'Investimento',
  transfer: 'Entre suas contas',
  pending: 'Transferência a confirmar',
};

function Rows({ rows }: { rows: PreviewRow[] }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, ROWS_SHOWN);
  return (
    <View>
      <SectionTitle>Prévia</SectionTitle>
      <View style={ui.rowList}>
        {shown.map((r, i) => {
          const faded = r.status === 'duplicate' || r.status === 'skipped';
          return (
            <View key={r.index} style={[ui.row, i === 0 && ui.rowFirst, faded && styles.faded]}>
              <Text style={ui.rowDate}>{shortDate(r.date)}</Text>
              <View style={ui.rowMain}>
                <Text style={ui.rowTitle} numberOfLines={2}>
                  {r.description}
                </Text>
                {r.status === 'new' ? (
                  <Text style={ui.rowSub}>
                    {r.kind === 'regular' ? (r.category ?? 'Outros') : KIND_LABELS[r.kind]}
                  </Text>
                ) : (
                  <View style={styles.tagLine}>
                    <Text style={styles.tag}>{TAGS[r.status]}</Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  ui.rowAmount,
                  isIncome(r.amount) && r.kind === 'regular' && ui.income,
                  r.kind !== 'regular' && styles.neutral,
                  faded && styles.struck,
                ]}
              >
                {money(r.amount, r.currency, true)}
              </Text>
            </View>
          );
        })}
        {rows.length > ROWS_SHOWN ? (
          <Pressable onPress={() => setAll(!all)} style={styles.more} accessibilityRole="button">
            <Text style={styles.moreText}>
              {all ? 'Mostrar menos' : `+ ${rows.length - ROWS_SHOWN} transações`}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Done({ summary, onAgain }: { summary: ImportSummary; onAgain: () => void }) {
  const extra = [
    summary.duplicate_count ? `${summary.duplicate_count} já existiam` : null,
    summary.skipped_count ? `${summary.skipped_count} fora do período` : null,
  ].filter(Boolean);
  return (
    <Card style={styles.gap}>
      <Text style={styles.cardTitle}>
        {summary.imported_count === 1
          ? '1 transação importada'
          : `${summary.imported_count} transações importadas`}
      </Text>
      <Text style={styles.note}>
        {summary.filename}
        {extra.length ? ` · ${extra.join(' · ')}` : ''}
      </Text>
      <View style={styles.actions}>
        <Button label="Enviar outro" onPress={onAgain} style={styles.flex1} />
        <Button
          primary
          label="Ver no início"
          onPress={() => router.navigate('/')}
          style={styles.flex1}
        />
      </View>
    </Card>
  );
}

function History({ items }: { items: ImportSummary[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.history}>
      <SectionTitle>Envios anteriores</SectionTitle>
      <View style={ui.rowList}>
        {items.slice(0, 10).map((h, i) => {
          const parts = [
            dayMonth(h.finished_at ?? h.created_at),
            `${h.imported_count} ${h.imported_count === 1 ? 'importada' : 'importadas'}`,
            h.duplicate_count ? `${h.duplicate_count} já existiam` : null,
          ].filter(Boolean);
          return (
            <View key={h.id} style={[ui.row, i === 0 && ui.rowFirst]}>
              <View style={ui.rowMain}>
                <Text style={ui.rowTitle} numberOfLines={1}>
                  {h.filename}
                </Text>
                <Text style={ui.rowSub}>{parts.join(' · ')}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 48, alignItems: 'center' },
  column: { width: '100%', maxWidth: 520 },
  back: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, paddingVertical: 4 },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 24,
    letterSpacing: -0.2,
    color: colors.ink,
    marginTop: 8,
    marginBottom: 20,
  },
  drop: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.dashed,
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
  },
  dropOver: { borderColor: colors.ink, backgroundColor: colors.soft },
  dropIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dropArrow: { fontFamily: fonts.semibold, fontSize: 20, color: colors.ink },
  dropTitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink, textAlign: 'center' },
  dropSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, textAlign: 'center' },
  error: { fontFamily: fonts.regular, fontSize: 14, color: colors.danger, marginTop: 12 },
  gap: { marginTop: 16 },
  gapSmall: { marginTop: 8 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 17, color: colors.ink },
  note: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    marginTop: 4,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  fileHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bankIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankIconText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.ink },
  fileName: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  ok: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.positive,
    backgroundColor: colors.positiveSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 10 },
  stat: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 10 },
  statValue: { fontFamily: fonts.semibold, fontSize: 22, color: colors.ink },
  statLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted, marginTop: 2 },
  errorsBox: { marginTop: 10, gap: 4 },
  warn: { fontFamily: fonts.medium, fontSize: 13, color: '#9A5B00' },
  errorLine: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  faded: { opacity: 0.45 },
  struck: { textDecorationLine: 'line-through' },
  tagLine: { flexDirection: 'row', marginTop: 4 },
  tag: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.muted,
    backgroundColor: colors.soft,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  neutral: { color: colors.muted },
  more: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  moreText: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  actions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  history: { marginTop: 12 },
  wideContent: { paddingHorizontal: PAGE_PAD, paddingTop: 28, paddingBottom: 48 },
  wideTitle: { marginTop: 0, fontSize: 20, letterSpacing: 0 },
  wideRow: { flexDirection: 'row', gap: 32, alignItems: 'flex-start', maxWidth: 1040 },
  wideMain: { flex: 1, minWidth: 0, maxWidth: 680 },
  // The drop zone has no title above it; pull the first section title level with it.
  aside: { width: 300, gap: 8, marginTop: -28 },
});
