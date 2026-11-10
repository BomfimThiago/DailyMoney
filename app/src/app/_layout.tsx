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
import { queryClient } from '@/lib/queries';
import { colors } from '@/theme';

export default function RootLayout() {
  const [loaded] = useFonts({ Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold });
  if (!loaded) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page } }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
