// Opening a bank's authorization page, with which bank is opening and what went wrong.
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform } from 'react-native';

import { errorText } from './api';
import { connectBrazil } from './brazilWindow';
import { startConnection, type ConnectionTarget } from './imports';
import { canOpenPluggy, openPluggyWindow } from './pluggyWindow';
import { useRefreshMoney } from './queries';
import type { Connection } from './types';

// Brazilian banks share one line: the bank is chosen on Meu Pluggy's own page.
export const BRAZIL = 'brasil';
export const BRAZIL_RETURN = '/conexoes/retorno-brasil';
export const ONLY_ON_SITE =
  'Por enquanto, bancos do Brasil são conectados pelo site do Daily Money, no navegador.';
export const BRAZIL_FAILED = 'A Pluggy não conseguiu conectar o banco. Você pode tentar de novo.';

// The bank's page brings the person back to /conexoes/retorno.
async function openEurope(bank: string, target?: ConnectionTarget) {
  const { url } = await startConnection(bank, target);
  if (Platform.OS === 'web') window.location.assign(url);
  else await Linking.openURL(url);
}

export function useConnect() {
  const refresh = useRefreshMoney();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openBrazil = () =>
    connectBrazil(openPluggyWindow, {
      arrived: () => router.navigate(BRAZIL_RETURN),
      failed: () => setError(BRAZIL_FAILED),
      closed: () => {
        setOpening(null);
        // A bank authorized before the window was closed shows up in the list.
        void refresh();
      },
    });

  // `line` is a European bank's name, or BRAZIL; `target` says which connection it is for.
  async function connect(line: string, target?: ConnectionTarget) {
    if (line === BRAZIL && !canOpenPluggy) return setError(ONLY_ON_SITE);
    setOpening(line);
    setError(null);
    try {
      await (line === BRAZIL ? openBrazil() : openEurope(line, target));
    } catch (e) {
      setError(errorText(e, 'Não deu para abrir o banco.'));
      setOpening(null);
    }
  }
  // A European bank renews that very connection: the same bank can be connected by
  // more than one person.
  const reconnect = (c: Connection) =>
    c.provider === 'pluggy' ? connect(BRAZIL) : connect(c.bank, { connection_id: c.id });
  return { opening, error, connect, reconnect };
}

export type Connect = ReturnType<typeof useConnect>;
