import type { ReactElement } from 'react';

import { DisplayCurrencyProvider } from '@/lib/displayCurrency';

// Screens read the chosen currency from the provider, as in the app. Tests that render
// with it mock '@/lib/api' so choosing a currency doesn't call the server.
export function withCurrency(ui: ReactElement): ReactElement {
  return <DisplayCurrencyProvider>{ui}</DisplayCurrencyProvider>;
}
