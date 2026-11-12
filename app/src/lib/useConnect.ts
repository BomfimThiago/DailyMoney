// Opening a bank's authorization page, with which bank is opening and what went wrong.
import { useState } from 'react';
import { Linking, Platform } from 'react-native';

import { errorText } from './api';
import { startConnection } from './imports';

export function useConnect() {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function connect(bank: string) {
    setOpening(bank);
    setError(null);
    try {
      const { url } = await startConnection(bank);
      // The bank's page brings the person back to /conexoes/retorno.
      if (Platform.OS === 'web') window.location.assign(url);
      else await Linking.openURL(url);
    } catch (e) {
      setError(errorText(e, 'Não deu para abrir o banco.'));
      setOpening(null);
    }
  }
  return { opening, error, connect };
}

export type Connect = ReturnType<typeof useConnect>;
