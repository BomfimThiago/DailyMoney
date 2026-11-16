import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api } from './api';
import { useAuth } from './auth';
import type { Currency } from './types';

// The currency every screen shows its amounts in. Each line is converted on the server
// with the European Central Bank rate of its own day; accounts keep their own currency.
export const DISPLAY_CURRENCIES: Currency[] = ['BRL', 'EUR', 'USD'];

interface DisplayCurrencyValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
}

const DisplayCurrencyContext = createContext<DisplayCurrencyValue>({
  currency: 'BRL',
  setCurrency: () => undefined,
});

// Starts with the family's saved choice and saves every change, so the phone and the
// computer open in the same currency.
export function DisplayCurrencyProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const saved = state.status === 'signedIn' ? state.me.family.display_currency : 'BRL';
  const [chosen, setChosen] = useState<Currency | null>(null);
  const setCurrency = useCallback((c: Currency) => {
    setChosen(c);
    // Best effort: if it doesn't save, this device still shows the chosen currency.
    api('/family', { method: 'PATCH', body: JSON.stringify({ display_currency: c }) }).catch(
      () => undefined,
    );
  }, []);
  const value = useMemo(
    () => ({ currency: chosen ?? saved, setCurrency }),
    [chosen, saved, setCurrency],
  );
  return (
    <DisplayCurrencyContext.Provider value={value}>{children}</DisplayCurrencyContext.Provider>
  );
}

export function useDisplayCurrency(): DisplayCurrencyValue {
  return useContext(DisplayCurrencyContext);
}
