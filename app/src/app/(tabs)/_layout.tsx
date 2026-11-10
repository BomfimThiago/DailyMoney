import { Tabs } from 'expo-router';

import { TabBar } from '@/components/nav';
import { colors } from '@/theme';

// The three main screens live in one tab navigator, so they stay mounted and switching
// between them is instant instead of rebuilding the page (which blinked).
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={() => <TabBar />}
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
  );
}
