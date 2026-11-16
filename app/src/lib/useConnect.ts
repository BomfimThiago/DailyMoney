// Opening a bank's authorization page, with which bank is opening and what went wrong.
import { useState } from 'react';
import { Linking, Platform } from 'react-native';

import { errorText } from './api';
import { startBrazilConnection, startConnection } from './imports';
import type { Connection } from './types';

// Brazilian banks share one line: the bank is chosen on Meu Pluggy's own page.
export const BRAZIL = 'brasil';

const start = (line: string) => (line === BRAZIL ? startBrazilConnection() : startConnection(line));

export function useConnect() {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `line` is a European bank's name, or BRAZIL.
  async function connect(line: string) {
    setOpening(line);
    setError(null);
    try {
      const { url } = await start(line);
      // The bank's page brings the person back to /conexoes/retorno (or retorno-brasil).
      if (Platform.OS === 'web') window.location.assign(url);
      else await Linking.openURL(url);
    } catch (e) {
      setError(errorText(e, 'Não deu para abrir o banco.'));
      setOpening(null);
    }
  }
  const reconnect = (c: Connection) => connect(c.provider === 'pluggy' ? BRAZIL : c.bank);
  return { opening, error, connect, reconnect };
}

export type Connect = ReturnType<typeof useConnect>;
