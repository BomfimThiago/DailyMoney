import { useState } from 'react';
import { TextInput, View } from 'react-native';

import type { TransactionsPage } from '@/lib/useTransactionsPage';
import { colors } from '@/theme';

import { FilterMenu } from './FilterMenu';
import { styles } from './styles';

// Search and the Categoria · Conta · Responsável menus. On a computer they sit in one row
// beside the tabs; on a phone the search takes a line and the menus wrap under it.
export function Filters({ page, wide }: { page: TransactionsPage; wide: boolean }) {
  const [focus, setFocus] = useState(false);
  const menus = (
    <>
      <FilterMenu
        label="Categoria"
        value={page.categoryId}
        options={page.categories}
        onChange={page.setCategoryId}
        align={wide ? 'right' : 'left'}
        short={!wide}
      />
      <FilterMenu
        label="Responsável"
        value={page.memberId}
        options={page.members}
        onChange={page.setMemberId}
        align={wide ? 'right' : 'left'}
        short={!wide}
      />
      <FilterMenu
        label="Conta"
        value={page.accountId}
        options={page.accounts}
        onChange={page.setAccountId}
        short={!wide}
      />
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
    </View>
  );
}
