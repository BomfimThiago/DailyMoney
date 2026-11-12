import { router } from 'expo-router';
import {
  Pressable,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { Button } from '@/components/ui';
import { pendingLabel } from '@/lib/home';
import type { Currency, CurrencySummary, MonthSummary } from '@/lib/types';

import { dash } from './styles';

// Before the first statement: a greeting and the way to send one.
export function NoAccounts({
  name,
  style,
  buttonStyle,
}: {
  name: string;
  style: StyleProp<ViewStyle>;
  buttonStyle?: ViewStyle;
}) {
  return (
    <View style={style}>
      <Text style={dash.emptyTitle}>Olá, {name}</Text>
      <Text style={dash.muted}>
        Envie o extrato de uma conta ou cartão para ver para onde vai o seu dinheiro.
      </Text>
      <Button
        primary
        label="Enviar extrato"
        onPress={() => router.push('/upload')}
        style={buttonStyle}
      />
    </View>
  );
}

// "2 transferências para confirmar · Ver", opening the Transferências tab.
export function PendingLink({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;
  return (
    <Pressable
      onPress={() =>
        router.navigate({ pathname: '/transacoes', params: { aba: 'transferencias' } })
      }
      accessibilityRole="link"
      style={[dash.pending, style]}
    >
      <View style={dash.pendingDot} />
      <Text style={dash.pendingText}>{pendingLabel(count)}</Text>
      <Text style={dash.pendingLink}>Ver</Text>
    </Pressable>
  );
}

export function CurrencyHint({
  summary,
  shown,
  style,
}: {
  summary: MonthSummary;
  shown: CurrencySummary;
  style: StyleProp<TextStyle>;
}) {
  if (summary.currencies.length < 2) return null;
  return (
    <Text style={style}>Só contas em {shown.currency}. A conversão entre moedas vem depois.</Text>
  );
}

// What Início needs from its screen, shared by the phone and the computer layouts.
export type Home = {
  month: string;
  setMonth: (m: string) => void;
  summary: MonthSummary | null;
  isError: boolean;
  shown: CurrencySummary | null;
  setCurrency: (c: Currency) => void;
  name: string;
};
