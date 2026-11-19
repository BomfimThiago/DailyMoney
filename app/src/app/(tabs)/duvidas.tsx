import { Link } from 'expo-router';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { styles } from '@/components/connections/styles';
import { Faq } from '@/components/help/Faq';
import { signedInPage } from '@/components/states';
import { WIDE_MIN } from '@/lib/dashboard';
import { CARD_FAQ } from '@/lib/faq';

// Dúvidas: plain answers about how the app counts things. For now, credit cards.
export default signedInPage(Help);

function Help() {
  const wide = useWindowDimensions().width >= WIDE_MIN;
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={wide ? styles.wideContent : styles.content}
    >
      <View style={styles.column}>
        {wide ? null : (
          <Link href="/" style={styles.back}>
            ‹ Início
          </Link>
        )}
        <Text style={[styles.title, wide && styles.wideTitle]}>Dúvidas</Text>
        <Text style={styles.lead}>
          Como o cartão de crédito entra nas suas contas no Daily Money.
        </Text>
        <View style={styles.gap}>
          <Faq items={CARD_FAQ} />
        </View>
      </View>
    </ScrollView>
  );
}
