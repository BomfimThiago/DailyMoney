import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  useFonts,
} from '@expo-google-fonts/figtree';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { AuthProvider } from '@/lib/auth';
import { DisplayCurrencyProvider } from '@/lib/displayCurrency';
import { MonthStartProvider } from '@/lib/monthStart';
import { queryClient } from '@/lib/queries';
import { tapAnywhere } from '@/lib/useCloseOnOutsideTap';
import { colors } from '@/theme';

export default function RootLayout() {
  const [loaded] = useFonts({ Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold });
  if (!loaded) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DisplayCurrencyProvider>
          <MonthStartProvider>
            <StatusBar style="dark" />
            <View style={{ flex: 1 }} onTouchStart={tapAnywhere}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.page },
                }}
              />
            </View>
          </MonthStartProvider>
        </DisplayCurrencyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
