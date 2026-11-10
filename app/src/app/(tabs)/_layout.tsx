import { Tabs } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { SideBar, TabBar } from '@/components/nav';
import { WIDE_MIN } from '@/lib/dashboard';
import { colors } from '@/theme';

// Every signed-in page lives in one tab navigator, so pages stay mounted and switching
// between them is instant instead of rebuilding the page (which blinked). On a wide
// window they sit next to a sidebar instead of over bottom tabs. Enviar extrato and
// Conexões have no bottom tab on a phone; they open from links on the screens.
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
          <Tabs.Screen name="analises" />
          <Tabs.Screen name="investimentos" />
          <Tabs.Screen name="transacoes" />
          <Tabs.Screen name="upload" />
          <Tabs.Screen name="conexoes" />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', backgroundColor: colors.page },
  main: { flex: 1 },
});
