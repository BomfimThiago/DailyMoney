import { Link } from 'expo-router';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { CurrencyChips } from '@/components/CurrencyChips';
import { PhonePortfolio, WidePortfolio } from '@/components/investments/Portfolio';
import { styles, wide } from '@/components/investments/styles';
import { Loadable, signedInPage } from '@/components/states';
import { contentWidth, TWO_COLUMNS, WIDE_MIN } from '@/lib/dashboard';
import { usePortfolio } from '@/lib/queries';

// Investimentos: the bank's own portfolio (balance of each investment, read from the
// connected banks). It is today's balance, so the page has no month to pick.
export default signedInPage(Investments);

function Investments() {
  const { width } = useWindowDimensions();
  const query = usePortfolio();
  const load = { isError: query.isError, loading: !query.data, value: query.data, empty: '' };
  return width >= WIDE_MIN ? (
    <ScrollView style={styles.page} contentContainerStyle={wide.content}>
      <View style={wide.column}>
        <View style={wide.head}>
          <Text style={wide.title}>Investimentos</Text>
          <CurrencyChips style={wide.chips} />
        </View>
        <View style={wide.sectionRow}>
          <Text style={wide.section}>Carteira no banco</Text>
          <BanksLink />
        </View>
        <Loadable {...load}>
          {(p) => <WidePortfolio p={p} twoColumns={contentWidth(width) >= TWO_COLUMNS} />}
        </Loadable>
      </View>
    </ScrollView>
  ) : (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          <View style={styles.head}>
            <Text style={styles.title}>Investimentos</Text>
          </View>
          <CurrencyChips style={styles.chips} />
          <Loadable {...load}>{(p) => <PhonePortfolio p={p} />}</Loadable>
          <BanksLink />
        </View>
      </ScrollView>
    </View>
  );
}

// Where the portfolio comes from: the connected banks (the old app's "Bancos conectados").
function BanksLink() {
  return (
    <Link href="/conexoes" style={styles.banksLink} testID="banks-link">
      Bancos conectados ›
    </Link>
  );
}
