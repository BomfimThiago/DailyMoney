import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { BillNav, CardBillsCard } from '@/components/cards/CardBills';
import { styles } from '@/components/cards/styles';
import { CurrencyChips } from '@/components/CurrencyChips';
import { Loadable, signedInPage } from '@/components/states';
import { NO_BILLS } from '@/lib/cards';
import { WIDE_MIN } from '@/lib/dashboard';
import { currentMonth } from '@/lib/format';
import { useCardBills } from '@/lib/queries';

// Cartões (from the old app): each card's bill, whether it was paid, the next one and its
// purchases with "3/10". The purchases still count in the month they were made.
export default signedInPage(Cards);

function Cards() {
  const wide = useWindowDimensions().width >= WIDE_MIN;
  const [month, setMonth] = useState(currentMonth);
  const query = useCardBills(month, true);
  const cards = query.data?.cards.length ? query.data.cards : null;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={wide ? styles.wideContent : styles.content}
    >
      <View style={wide ? styles.wideColumn : styles.column}>
        {wide ? null : (
          <Link href="/" style={styles.back}>
            ‹ Início
          </Link>
        )}
        <View style={styles.head}>
          <Text style={styles.title}>Cartões</Text>
          <View style={styles.headRight}>
            {wide ? <CurrencyChips style={styles.chips} /> : null}
            <BillNav month={month} onChange={setMonth} />
          </View>
        </View>
        <Text style={styles.lead}>
          O que sai da conta para pagar cada fatura. As compras continuam contando no mês em que
          foram feitas, cada uma na sua categoria.
        </Text>
        {wide ? null : <CurrencyChips style={styles.phoneChips} />}
        <Loadable
          isError={query.isError}
          loading={!query.data}
          value={cards}
          empty={NO_BILLS}
          error="Não consegui carregar as faturas. Tente de novo."
          textStyle={[styles.empty, styles.emptyBox]}
        >
          {(list) => (
            <>
              {list.map((c) => (
                <CardBillsCard key={`${c.account_id}-${month}`} card={c} wide={wide} />
              ))}
            </>
          )}
        </Loadable>
      </View>
    </ScrollView>
  );
}
