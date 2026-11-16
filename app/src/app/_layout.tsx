import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  useFonts,
} from '@expo-google-fonts/figtree';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/lib/auth';
import { DisplayCurrencyProvider } from '@/lib/displayCurrency';
import { MonthStartProvider } from '@/lib/monthStart';
import { queryClient } from '@/lib/queries';
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
            <Stack
              screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page } }}
            />
          </MonthStartProvider>
        </DisplayCurrencyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
