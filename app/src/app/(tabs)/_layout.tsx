import { Tabs } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { SideBar, TabBar } from '@/components/nav';
import { WIDE_MIN } from '@/lib/dashboard';
import { colors } from '@/theme';

// The three main screens live in one tab navigator, so they stay mounted and switching
// between them is instant instead of rebuilding the page (which blinked). On a wide
// window the same screens sit next to a sidebar instead of over bottom tabs.
export default function TabsLayout() {
  const wide = useWindowDimensions().width >= WIDE_MIN;
  return (
    <View style={styles.row}>
      {wide ? <SideBar /> : null}
      <View style={styles.main}>
        <Tabs
          tabBar={() => (wide ? null : <TabBar />)}
          screenOptions={{
            headerShown: false,
            lazy: false,
            sceneStyle: { backgroundColor: colors.page },
          }}
        >
          <Tabs.Screen name="index" />
          <Tabs.Screen name="investimentos" />
          <Tabs.Screen name="transacoes" />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', backgroundColor: colors.page },
  main: { flex: 1 },
});
