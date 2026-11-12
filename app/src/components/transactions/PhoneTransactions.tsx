import { ScrollView, Text, View } from 'react-native';

import { MonthNav } from '@/components/nav';
import { TxRow } from '@/components/TxRow';
import type { TransactionsPage } from '@/lib/useTransactionsPage';

import { ListBody, MoreButton, Sheet, TabSegment, TransfersBody } from './parts';
import { styles } from './styles';

// Phone: a list, and the detail opens as a sheet.
export function PhoneTransactions({ page }: { page: TransactionsPage }) {
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.head}>
            <Text style={styles.title}>Transações</Text>
            <MonthNav month={page.month} onChange={page.setMonth} compact />
          </View>
          <TabSegment page={page} />
          {page.tab === 'lista' ? (
            <ListBody page={page}>
              {(items) => (
                <View style={styles.top}>
                  {items.map((t, i) => (
                    <TxRow
                      key={t.id}
                      t={t}
                      first={i === 0}
                      onPress={() => page.setSelectedId(t.id)}
                    />
                  ))}
                  <MoreButton page={page} />
                </View>
              )}
            </ListBody>
          ) : (
            <TransfersBody page={page} />
          )}
        </View>
      </ScrollView>
      <Sheet
        t={page.selected}
        onClose={() => page.setSelectedId(null)}
        onChanged={page.refreshMoney}
      />
    </View>
  );
}
