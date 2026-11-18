import { Fragment } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { CurrencyChips } from '@/components/CurrencyChips';
import { MonthNav } from '@/components/nav';
import { dayHeading } from '@/components/TxTable';
import { TxRow } from '@/components/TxRow';
import type { TransactionsPage } from '@/lib/useTransactionsPage';

import { Filters } from './Filters';
import { ListBody, MoreButton, Sheet, TabSegment, TransfersBody } from './parts';
import { ReviewBody } from './Review';
import { styles } from './styles';
import { Totals } from './Totals';

// Phone: a list, and the detail opens as a sheet.
export function PhoneTransactions({ page }: { page: TransactionsPage }) {
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.head}>
            <Text style={styles.title}>Transações</Text>
            {page.tab !== 'lista' || page.period === 'month' ? (
              <MonthNav month={page.month} onChange={page.setMonth} compact />
            ) : null}
          </View>
          <CurrencyChips style={styles.currencies} />
          <TabSegment page={page} />
          {page.tab === 'lista' ? <Filters page={page} wide={false} /> : null}
          {page.tab === 'lista' ? <Totals page={page} wide={false} /> : null}
          {page.tab === 'lista' ? (
            <ListBody page={page}>
              {(items) => (
                <View style={styles.top}>
                  {items.map((t, i) => {
                    // By day, each day gets a heading with what it adds up to.
                    const newDay =
                      page.sort === 'date' && (i === 0 || items[i - 1].date !== t.date);
                    return (
                      <Fragment key={t.id}>
                        {newDay ? <DayHeading date={t.date} total={page.days[t.date]} /> : null}
                        <TxRow
                          t={t}
                          first={i === 0 || newDay}
                          onPress={() => page.setSelectedId(t.id)}
                        />
                      </Fragment>
                    );
                  })}
                  <MoreButton page={page} />
                </View>
              )}
            </ListBody>
          ) : page.tab === 'revisar' ? (
            <ReviewBody page={page} wide={false} />
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

function DayHeading({ date, total }: { date: string; total?: string }) {
  return (
    <View style={styles.dayHead}>
      <Text style={styles.dayText}>{dayHeading(date)}</Text>
      {total ? <Text style={styles.dayText}>{total}</Text> : null}
    </View>
  );
}
