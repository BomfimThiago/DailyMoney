import { Link } from 'expo-router';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { styles } from '@/components/connections/styles';
import { MonthStartPicker } from '@/components/settings/MonthStartPicker';
import { ReviewImportsSetting } from '@/components/settings/ReviewImportsSetting';
import { signedInPage } from '@/components/states';
import { WIDE_MIN } from '@/lib/dashboard';

// Ajustes: the family's settings: the day the month starts on, and whether imports wait
// for approval.
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
          <ReviewImportsSetting />
        </View>
      </View>
    </ScrollView>
  );
}
