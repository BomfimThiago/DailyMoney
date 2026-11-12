import { useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { signedInPage } from '@/components/states';
import { PhoneTransactions } from '@/components/transactions/PhoneTransactions';
import { WideTransactions } from '@/components/transactions/WideTransactions';
import { WIDE_MIN } from '@/lib/dashboard';
import { useTransactionsPage } from '@/lib/useTransactionsPage';

// Transações, with transfers between the family's own accounts as a second tab (variant A).
export default signedInPage(Transactions);

function Transactions() {
  const { aba } = useLocalSearchParams<{ aba?: string }>();
  const wide = useWindowDimensions().width >= WIDE_MIN;
  const page = useTransactionsPage(wide, aba);
  return wide ? <WideTransactions page={page} /> : <PhoneTransactions page={page} />;
}
