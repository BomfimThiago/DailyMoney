import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { MonthNav, Segment } from '@/components/nav';
import { TxDetail } from '@/components/TxDetail';
import { TxRow } from '@/components/TxRow';
import { TxTable } from '@/components/TxTable';
import { Transfers } from '@/components/Transfers';
import { useAuth } from '@/lib/auth';
import { WIDE_MIN } from '@/lib/dashboard';
import { currentMonth } from '@/lib/format';
import {
  useAccounts,
  useCategories,
  useRefreshMoney,
  useRegular,
  useTransfers,
} from '@/lib/queries';
import type { Transaction } from '@/lib/types';
import { colors, fonts } from '@/theme';

type Tab = 'lista' | 'transferencias';

// Transações, with transfers between the family's own accounts as a second tab (variant A).
// On a computer the list is a table with search, filters and the detail beside it; on a
// phone it is a list and the detail opens as a sheet.
export default function TransactionsScreen() {
  const { state } = useAuth();
  const params = useLocalSearchParams<{ aba?: string }>();
  const [tab, setTab] = useState<Tab>(params.aba === 'transferencias' ? 'transferencias' : 'lista');
  const [month, setMonth] = useState(currentMonth);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchFocus, setSearchFocus] = useState(false);
  const wide = useWindowDimensions().width >= WIDE_MIN;
  const signedIn = state.status === 'signedIn';
  const regular = useRegular(month, signedIn, wide ? { q: query, categoryId, accountId } : {});
  const transfersQuery = useTransfers(month, signedIn);
  const categories = useCategories(signedIn && wide);
  const accounts = useAccounts(signedIn && wide);
  const refreshMoney = useRefreshMoney();

  // Search as the person types, without a request per key.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // The screen stays mounted between tabs, so a link from Início with ?aba= must switch
  // here; adjusting state while rendering is React's pattern for following a prop.
  const [seenAba, setSeenAba] = useState(params.aba);
  if (params.aba !== seenAba) {
    setSeenAba(params.aba);
    if (params.aba === 'transferencias') setTab('transferencias');
  }

  if (state.status === 'loading') return <View style={styles.page} />;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const items = regular.data?.pages.flatMap((p) => p.items) ?? null;
  const total = regular.data?.pages[regular.data.pages.length - 1].total ?? 0;
  const transfers = transfersQuery.data ?? null;
  const selected = items?.find((t) => t.id === selectedId) ?? null;
  const filtered = wide && (query.trim() !== '' || categoryId !== null || accountId !== null);

  const pendingCount = transfers?.pending.length ?? 0;

  const segment = (
    <Segment
      options={[
        { value: 'lista', label: 'Gastos e entradas' },
        { value: 'transferencias', label: 'Transferências', badge: pendingCount },
      ]}
      value={tab}
      onChange={setTab}
    />
  );

  const more = regular.hasNextPage ? (
    <Pressable
      onPress={() => regular.fetchNextPage()}
      disabled={regular.isFetchingNextPage}
      accessibilityRole="button"
      style={styles.more}
    >
      {regular.isFetchingNextPage ? (
        <ActivityIndicator color={colors.muted} />
      ) : (
        <Text style={styles.moreText}>Mostrar mais ({total - (items?.length ?? 0)})</Text>
      )}
    </Pressable>
  ) : null;

  const listState = regular.isError ? (
    <Text style={[styles.empty, styles.top]}>Não consegui carregar. Tente de novo.</Text>
  ) : !items ? (
    <ActivityIndicator color={colors.muted} style={styles.loading} />
  ) : items.length === 0 ? (
    <Text style={[styles.empty, styles.top]}>
      {filtered ? 'Nada encontrado com esses filtros.' : 'Nenhum gasto ou entrada neste mês.'}
    </Text>
  ) : null;

  const transfersView = transfersQuery.isError ? (
    <Text style={[styles.empty, styles.top]}>Não consegui carregar. Tente de novo.</Text>
  ) : !transfers ? (
    <ActivityIndicator color={colors.muted} style={styles.loading} />
  ) : (
    <Transfers data={transfers} month={month} onChanged={refreshMoney} />
  );

  if (wide) {
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.wideContent}>
        <View style={styles.wideColumn}>
          <View style={styles.head}>
            <Text style={styles.title}>Transações</Text>
            <MonthNav month={month} onChange={setMonth} compact />
          </View>
          <View style={styles.toolbar}>
            <View style={styles.segmentBox}>{segment}</View>
            {tab === 'lista' ? (
              <View style={styles.filters}>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Buscar descrição"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Buscar descrição"
                  onFocus={() => setSearchFocus(true)}
                  onBlur={() => setSearchFocus(false)}
                  style={[styles.search, searchFocus && styles.searchFocus]}
                />
                <FilterMenu
                  label="Categoria"
                  value={categoryId}
                  options={(categories.data ?? [])
                    .filter((c) => c.kind !== 'transfer')
                    .map((c) => ({ id: c.id, name: c.name }))}
                  onChange={setCategoryId}
                />
                <FilterMenu
                  label="Conta"
                  value={accountId}
                  options={(accounts.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
                  onChange={setAccountId}
                />
              </View>
            ) : null}
          </View>

          {tab === 'lista' ? (
            <View style={styles.split}>
              <View style={styles.tableBox}>
                {listState ?? (
                  <>
                    <TxTable
                      items={items ?? []}
                      selectedId={selectedId}
                      onSelect={(t) => setSelectedId(t.id)}
                    />
                    {more}
                  </>
                )}
              </View>
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>DETALHE</Text>
                {selected ? (
                  <TxDetail key={selected.id} t={selected} onChanged={refreshMoney} />
                ) : (
                  <Text style={styles.empty}>
                    Clique numa linha para ver o detalhe e trocar a categoria.
                  </Text>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.transfersBox}>{transfersView}</View>
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.head}>
            <Text style={styles.title}>Transações</Text>
            <MonthNav month={month} onChange={setMonth} compact />
          </View>
          {segment}

          {tab === 'lista'
            ? (listState ?? (
                <View style={styles.top}>
                  {(items ?? []).map((t, i) => (
                    <TxRow key={t.id} t={t} first={i === 0} onPress={() => setSelectedId(t.id)} />
                  ))}
                  {more}
                </View>
              ))
            : transfersView}
        </View>
      </ScrollView>
      <Sheet t={selected} onClose={() => setSelectedId(null)} onChanged={refreshMoney} />
    </View>
  );
}

// Phone: the detail slides up from the bottom; tapping outside closes it.
function Sheet({
  t,
  onClose,
  onChanged,
}: {
  t: Transaction | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Modal visible={t !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.dim} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={styles.sheet}>
        <View style={styles.grip} />
        {t ? <TxDetail key={t.id} t={t} onChanged={onChanged} /> : null}
        <Pressable onPress={onClose} accessibilityRole="button" style={styles.close}>
          <Text style={styles.moreText}>Fechar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// A filter button that opens its list underneath: "Categoria" or "Categoria: Mercado".
function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { id: string; name: string }[];
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };
  return (
    <View style={styles.menuBox}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={[styles.menuButton, current && styles.menuButtonOn]}
      >
        <Text style={[styles.menuText, current && styles.menuTextOn]} numberOfLines={1}>
          {current ? `${label}: ${current.name}` : label} ▾
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.menu} accessibilityRole="menu">
          <MenuItem label="Todas" on={value === null} onPress={() => pick(null)} />
          {options.map((o) => (
            <MenuItem key={o.id} label={o.name} on={o.id === value} onPress={() => pick(o.id)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MenuItem({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityState={{ selected: on }}
      style={[styles.menuItem, on && styles.menuItemOn]}
    >
      <Text style={[styles.menuItemText, on && styles.menuTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, alignItems: 'center' },
  column: { width: '100%', maxWidth: 520 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { fontFamily: fonts.semibold, fontSize: 20, color: colors.ink },
  loading: { marginVertical: 32 },
  top: { marginTop: 16 },
  empty: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  more: { paddingVertical: 14, alignItems: 'center' },
  moreText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },

  wideContent: { paddingHorizontal: 36, paddingTop: 28, paddingBottom: 48 },
  wideColumn: { width: '100%', maxWidth: 1108 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
    // The filter menus open over the table.
    zIndex: 10,
  },
  segmentBox: { width: 360 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: {
    width: 220,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
    outlineWidth: 0,
  },
  searchFocus: { borderColor: colors.ink },
  menuBox: { position: 'relative' },
  menuButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: 220,
  },
  menuButtonOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  menuText: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  menuTextOn: { color: colors.page },
  menu: {
    position: 'absolute',
    top: 42,
    right: 0,
    minWidth: 200,
    maxHeight: 320,
    overflow: 'scroll',
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 4,
    shadowColor: colors.ink,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  menuItem: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 },
  menuItemOn: { backgroundColor: colors.ink },
  menuItemText: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink },
  split: { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  tableBox: { flex: 1, minWidth: 0 },
  panel: {
    width: 300,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    paddingLeft: 24,
    gap: 12,
    minHeight: 240,
  },
  panelTitle: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.7, color: colors.muted },
  transfersBox: { maxWidth: 640 },

  dim: { flex: 1, backgroundColor: 'rgba(43,40,64,0.18)' },
  sheet: {
    backgroundColor: colors.page,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 8,
  },
  grip: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.dashed,
    marginBottom: 6,
  },
  close: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20 },
});
