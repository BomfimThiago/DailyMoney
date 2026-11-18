import { Link } from 'expo-router';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { styles } from '@/components/connections/styles';
import { DeleteAllSetting } from '@/components/settings/DeleteAllSetting';
import { MonthStartPicker } from '@/components/settings/MonthStartPicker';
import { ReviewImportsSetting } from '@/components/settings/ReviewImportsSetting';
import { signedInPage } from '@/components/states';
import { WIDE_MIN } from '@/lib/dashboard';

// Ajustes: the family's settings: the day the month starts on, whether imports wait
// for approval, and starting over without any transaction.
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
          <DeleteAllSetting />
        </View>
      </View>
    </ScrollView>
  );
}
