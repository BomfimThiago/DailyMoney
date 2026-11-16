import { Link } from 'expo-router';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { styles } from '@/components/connections/styles';
import { MonthStartPicker } from '@/components/settings/MonthStartPicker';
import { signedInPage } from '@/components/states';
import { WIDE_MIN } from '@/lib/dashboard';

// Ajustes: the family's settings. For now, the day the month starts on.
export default signedInPage(Settings);

function Settings() {
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
        <Text style={[styles.title, wide && styles.wideTitle]}>Ajustes</Text>
        <View style={styles.gap}>
          <MonthStartPicker />
        </View>
      </View>
    </ScrollView>
  );
}
