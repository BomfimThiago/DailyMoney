import { useState } from 'react';

import { errorText } from './api';
import { undoImport } from './imports';
import { useRefreshMoney } from './queries';
import type { ImportSummary } from './types';

// Envios anteriores: one sent statement at a time asks for confirmation before going.
export function useUndoImport() {
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshMoney = useRefreshMoney();

  const close = () => {
    setAsking(null);
    setError(null);
  };

  const undo = async (h: ImportSummary) => {
    setBusy(true);
    setError(null);
    try {
      await undoImport(h.id);
      setAsking(null);
      await refreshMoney();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return {
    asking,
    busy,
    error,
    ask: (id: string) => {
      setAsking(id);
      setError(null);
    },
    close,
    undo,
  };
}
