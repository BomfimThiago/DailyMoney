import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { MonthNav } from '@/components/nav';
import { TxDetail } from '@/components/TxDetail';
import { TxTable } from '@/components/TxTable';
import type { TransactionsPage } from '@/lib/useTransactionsPage';
import { colors } from '@/theme';

import { FilterMenu } from './FilterMenu';
import { ListBody, MoreButton, TabSegment, TransfersBody } from './parts';
import { styles } from './styles';

// Computer: a table with search and filters, and the detail beside it.
export function WideTransactions({ page }: { page: TransactionsPage }) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.wideContent}>
      <View style={styles.wideColumn}>
        <View style={styles.head}>
          <Text style={styles.title}>Transações</Text>
          <MonthNav month={page.month} onChange={page.setMonth} compact />
        </View>
        <View style={styles.toolbar}>
          <View style={styles.segmentBox}>
            <TabSegment page={page} />
          </View>
          {page.tab === 'lista' ? <Filters page={page} /> : null}
        </View>
        {page.tab === 'lista' ? (
          <View style={styles.split}>
            <View style={styles.tableBox}>
              <ListBody page={page}>
                {(items) => (
                  <>
                    <TxTable
                      items={items}
                      selectedId={page.selectedId}
                      onSelect={(t) => page.setSelectedId(t.id)}
                    />
                    <MoreButton page={page} />
                  </>
                )}
              </ListBody>
            </View>
            <DetailPanel page={page} />
          </View>
        ) : (
          <View style={styles.transfersBox}>
            <TransfersBody page={page} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Filters({ page }: { page: TransactionsPage }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={styles.filters}>
      <TextInput
        value={page.search}
        onChangeText={page.setSearch}
        placeholder="Buscar descrição"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Buscar descrição"
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[styles.search, focus && styles.searchFocus]}
      />
      <FilterMenu
        label="Categoria"
        value={page.categoryId}
        options={page.categories}
        onChange={page.setCategoryId}
      />
      <FilterMenu
        label="Conta"
        value={page.accountId}
        options={page.accounts}
        onChange={page.setAccountId}
      />
    </View>
  );
}

function DetailPanel({ page }: { page: TransactionsPage }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>DETALHE</Text>
      {page.selected ? (
        <TxDetail key={page.selected.id} t={page.selected} onChanged={page.refreshMoney} />
      ) : (
        <Text style={styles.empty}>Clique numa linha para ver o detalhe e trocar a categoria.</Text>
      )}
    </View>
  );
}
