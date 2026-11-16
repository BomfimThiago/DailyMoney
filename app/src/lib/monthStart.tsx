import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api } from './api';
import { useAuth } from './auth';
import { currentPeriod, normalizeStartDay } from './period';

// The day the family's month starts on (the salary day). Every month-based screen uses it:
// the server cuts the months with it, the app names them and finds "this month".
interface MonthStartValue {
  startDay: number;
  saveStartDay: (day: number) => Promise<void>;
}

const MonthStartContext = createContext<MonthStartValue>({
  startDay: 1,
  saveStartDay: async () => undefined,
});

export function MonthStartProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const client = useQueryClient();
  const saved = state.status === 'signedIn' ? state.me.family.month_start_day : 1;
  const [chosen, setChosen] = useState<number | null>(null);
  const saveStartDay = useCallback(
    async (day: number) => {
      await api('/family', { method: 'PATCH', body: JSON.stringify({ month_start_day: day }) });
      setChosen(day);
      // Every month on every screen changes its days.
      await client.invalidateQueries({ queryKey: ['money'] });
    },
    [client],
  );
  const value = useMemo(
    () => ({ startDay: normalizeStartDay(chosen ?? saved), saveStartDay }),
    [chosen, saved, saveStartDay],
  );
  return <MonthStartContext.Provider value={value}>{children}</MonthStartContext.Provider>;
}

export function useMonthStart(): MonthStartValue {
  return useContext(MonthStartContext);
}

// "YYYY-MM" of the month today is in, with the family's start day.
export function useCurrentMonth(): string {
  return currentPeriod(useMonthStart().startDay);
}

// The month a screen shows: starts on this month and goes back to it when the start day
// changes (the old month's name may now mean other days).
export function useMonthState(): [string, (month: string) => void] {
  const { startDay } = useMonthStart();
  const current = currentPeriod(startDay);
  const [state, setState] = useState({ month: current, startDay });
  const setMonth = useCallback((month: string) => setState({ month, startDay }), [startDay]);
  return [state.startDay === startDay ? state.month : current, setMonth];
}
