import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { TxSort } from '@/lib/imports';
import { PERIODS, type PeriodKind, SORT_OPTIONS, TYPE_OPTIONS } from '@/lib/transactions';
import type { Currency } from '@/lib/types';
import type { TransactionsPage } from '@/lib/useTransactionsPage';
import { colors } from '@/theme';

import { FilterMenu } from './FilterMenu';
import { styles } from './styles';

// Everything that narrows the list, like the old app: search, Categoria, Responsável,
// Conta, Tipo and Moeda, the internal transfers switch and "Limpar filtros". On a computer
// one row under the tabs; on a phone the search takes a line and the menus wrap under it.
export function Filters({ page, wide }: { page: TransactionsPage; wide: boolean }) {
  const [focus, setFocus] = useState(false);
  const align = 'left';
  const menus = (
    <>
      {wide ? null : <PeriodMenu page={page} short />}
      <FilterMenu
        label="Categoria"
        value={page.categoryId}
        options={page.categories}
        onChange={page.setCategoryId}
        align={align}
        short={!wide}
      />
      <FilterMenu
        label="Responsável"
        value={page.memberId}
        options={page.members}
        onChange={page.setMemberId}
        align={align}
        short={!wide}
      />
      <FilterMenu
        label="Conta"
        value={page.accountId}
        options={page.accounts}
        onChange={page.setAccountId}
        align={wide ? 'left' : 'right'}
        short={!wide}
      />
      <FilterMenu
        label="Tipo"
        value={page.direction}
        options={TYPE_OPTIONS}
        onChange={(v) => page.setDirection(v as 'in' | 'out' | null)}
        allLabel="Gastos e entradas"
        align={align}
        short={!wide}
      />
      {page.currencies.length > 1 ? (
        <FilterMenu
          label="Moeda"
          value={page.accountCurrency}
          options={page.currencies}
          onChange={(v) => page.setAccountCurrency(v as Currency | null)}
          allLabel="Todas as moedas"
          align={align}
          short={!wide}
        />
      ) : null}
      {wide ? null : (
        <FilterMenu
          label="Ordem"
          value={page.sort}
          options={SORT_OPTIONS}
          onChange={(v) => page.setSort((v ?? 'date') as TxSort)}
          allLabel={null}
          align="right"
          short
        />
      )}
      <TransfersSwitch page={page} />
      {page.narrowed ? (
        <Pressable
          onPress={page.clearAll}
          accessibilityRole="button"
          accessibilityLabel="Limpar filtros"
          hitSlop={6}
          style={styles.clear}
        >
          <Text style={styles.clearText}>✕ Limpar filtros</Text>
        </Pressable>
      ) : null}
    </>
  );
  return (
    <View style={wide ? styles.filters : styles.filtersPhone}>
      <TextInput
        value={page.search}
        onChangeText={page.setSearch}
        placeholder="Buscar descrição"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Buscar descrição"
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[styles.search, !wide && styles.searchPhone, focus && styles.searchFocus]}
      />
      {wide ? menus : <View style={styles.menusPhone}>{menus}</View>}
      {wide ? null : <RangeFields page={page} />}
    </View>
  );
}

// Transfers between the family's own accounts stay out of the list unless asked for;
// they never count in the totals either way.
function TransfersSwitch({ page }: { page: TransactionsPage }) {
  const on = page.withTransfers;
  return (
    <Pressable
      onPress={() => page.setWithTransfers(!on)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={[styles.menuButton, on && styles.menuButtonOn]}
    >
      <Text style={[styles.menuText, on && styles.menuTextOn]} numberOfLines={1}>
        {on ? '✓ ' : ''}Transferências internas
      </Text>
    </Pressable>
  );
}

// Mês, Todo o período or Entre datas.
export function PeriodMenu({ page, short }: { page: TransactionsPage; short?: boolean }) {
  return (
    <FilterMenu
      label="Período"
      value={page.period}
      options={PERIODS}
      onChange={(v) => page.setPeriod((v ?? 'month') as PeriodKind)}
      allLabel={null}
      align="left"
      short={short}
    />
  );
}

// De and Até, typed like the dates in the edit form ("28/11/2026"); either may stay empty.
export function RangeFields({ page }: { page: TransactionsPage }) {
  if (page.period !== 'range') return null;
  return (
    <View style={styles.rangeBox}>
      <View style={styles.range}>
        <DateField label="De" value={page.fromText} onChange={page.setFromText} />
        <DateField label="Até" value={page.toText} onChange={page.setToText} />
      </View>
      {page.rangeError ? <Text style={styles.rangeError}>{page.rangeError}</Text> : null}
    </View>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={styles.dateField}>
      <Text style={styles.dateLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="dd/mm/aaaa"
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        inputMode="numeric"
        maxLength={10}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[styles.search, styles.dateInput, focus && styles.searchFocus]}
      />
    </View>
  );
}
