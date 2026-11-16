import { useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { HomeDashboard } from '@/components/HomeDashboard';
import { PhoneHome } from '@/components/home/PhoneHome';
import { SignedIn } from '@/components/states';
import { useAuth } from '@/lib/auth';
import { useDisplayCurrency } from '@/lib/displayCurrency';
import { WIDE_MIN } from '@/lib/dashboard';
import { currentMonth } from '@/lib/format';
import { firstName, shownCurrency } from '@/lib/home';
import { useSummary } from '@/lib/queries';

// Início: the month summary on a phone, the dashboard on a computer.
export default function HomeScreen() {
  const { state, signOut } = useAuth();
  return (
    <SignedIn>
      {state.status === 'signedIn' ? (
        <HomePage name={firstName(state.me.name)} signOut={signOut} />
      ) : null}
    </SignedIn>
  );
}

function HomePage({ name, signOut }: { name: string; signOut: () => void }) {
  const [month, setMonth] = useState(currentMonth);
  const { currency } = useDisplayCurrency();
  const query = useSummary(month, true);
  const summary = query.data ?? null;
  const home = {
    month,
    setMonth,
    summary,
    isError: query.isError,
    shown: shownCurrency(summary, currency),
    name,
  };
  return useWindowDimensions().width >= WIDE_MIN ? (
    <HomeDashboard home={home} />
  ) : (
    <PhoneHome home={home} signOut={signOut} />
  );
}
