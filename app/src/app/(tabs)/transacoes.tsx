import { useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { signedInPage } from '@/components/states';
import { PhoneTransactions } from '@/components/transactions/PhoneTransactions';
import { WideTransactions } from '@/components/transactions/WideTransactions';
import { WIDE_MIN } from '@/lib/dashboard';
import type { DrillParams } from '@/lib/drill';
import { useTransactionsPage } from '@/lib/useTransactionsPage';

// Transações, with transfers between the family's own accounts as a second tab (variant A).
export default signedInPage(Transactions);

function Transactions() {
  const { aba, ...link } = useLocalSearchParams<{ aba?: string } & DrillParams>();
  const wide = useWindowDimensions().width >= WIDE_MIN;
  const page = useTransactionsPage(aba, link);
  return wide ? <WideTransactions page={page} /> : <PhoneTransactions page={page} />;
}
