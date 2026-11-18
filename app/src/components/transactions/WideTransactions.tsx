import { Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { CurrencyChips } from '@/components/CurrencyChips';
import { MonthNav } from '@/components/nav';
import { TxDetail } from '@/components/TxDetail';
import { TxTable } from '@/components/TxTable';
import type { TransactionsPage } from '@/lib/useTransactionsPage';

import { Filters, PeriodMenu, RangeFields } from './Filters';
import { ReviewBody } from './Review';
import { ListBody, MoreButton, showsReview, TabSegment, TransfersBody } from './parts';
import { styles } from './styles';
import { Totals } from './Totals';

// Computer: a table with search and filters, and the detail beside it.
export function WideTransactions({ page }: { page: TransactionsPage }) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.wideContent}>
      <View style={styles.wideColumn}>
        <View style={styles.head}>
          <Text style={styles.title}>Transações</Text>
          <View style={styles.headRight}>
            <CurrencyChips />
            {page.tab === 'lista' ? <PeriodMenu page={page} /> : null}
            {page.tab === 'revisar' || page.period === 'month' ? (
              <MonthNav month={page.month} onChange={page.setMonth} compact />
            ) : (
              <RangeFields page={page} />
            )}
          </View>
        </View>
        {showsReview(page) ? (
          <View style={styles.toolbar}>
            <View style={styles.segmentBox}>
              <TabSegment page={page} />
            </View>
          </View>
        ) : null}
        {page.tab === 'lista' ? <Filters page={page} wide /> : null}
        {page.tab === 'lista' ? (
          <View style={styles.split}>
            <View style={styles.tableBox}>
              <TransfersBody page={page} />
              <Totals page={page} wide />
              <ListBody page={page}>
                {(items) => (
                  <>
                    <TxTable
                      items={items}
                      selectedId={page.selectedId}
                      onSelect={(t) => page.setSelectedId(t.id)}
                      sort={page.sort}
                      onSort={page.setSort}
                      days={page.days}
                      members={page.members}
                    />
                    <MoreButton page={page} />
                  </>
                )}
              </ListBody>
            </View>
            <DetailPanel page={page} />
          </View>
        ) : (
          <View style={styles.split}>
            <View style={styles.tableBox}>
              <ReviewBody page={page} wide />
            </View>
            <DetailPanel page={page} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// The panel stays in view while the table scrolls (sticky on the web), so a line picked
// far down is edited right where it is; a panel taller than the window scrolls by itself.
function DetailPanel({ page }: { page: TransactionsPage }) {
  const { height } = useWindowDimensions();
  const follow =
    Platform.OS === 'web'
      ? ({ position: 'sticky', top: PANEL_GAP, maxHeight: height - 2 * PANEL_GAP } as object)
      : null;
  return (
    <View style={[styles.panel, follow]}>
      <ScrollView contentContainerStyle={styles.panelBody} keyboardShouldPersistTaps="handled">
        <Text style={styles.panelTitle}>DETALHE</Text>
        {page.selected ? (
          <TxDetail key={page.selected.id} t={page.selected} onChanged={page.refreshMoney} />
        ) : (
          <Text style={styles.empty}>Clique numa linha para ver o detalhe, editar ou excluir.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const PANEL_GAP = 16;
