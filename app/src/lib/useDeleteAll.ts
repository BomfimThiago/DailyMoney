import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { errorText } from './api';
import { deleteAllTransactions, getPurgeOverview } from './imports';
import { confirmed } from './purge';
import { useRefreshMoney } from './queries';

// Apagar todas as transações: open, count what goes, type APAGAR, delete. The server
// checks the count shown here: if lines arrived meanwhile, nothing is deleted.
export function useDeleteAll() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<number | null>(null);
  const refreshMoney = useRefreshMoney();
  const overview = useQuery({
    queryKey: ['money', 'purge'],
    queryFn: getPurgeOverview,
    enabled: open,
  });

  const close = () => {
    setOpen(false);
    setTyped('');
    setError(null);
  };

  const submit = async () => {
    const o = overview.data;
    if (!o || !confirmed(typed) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteAllTransactions(o.transactions);
      close();
      setRemoved(result.removed);
      await refreshMoney();
    } catch (e) {
      setError(errorText(e));
      // The count changed (or something failed): count again for the next try.
      void overview.refetch();
    } finally {
      setBusy(false);
    }
  };

  return {
    open,
    typed,
    busy,
    error,
    removed,
    overview,
    ready: confirmed(typed),
    start: () => {
      setRemoved(null);
      setOpen(true);
    },
    close,
    setTyped,
    submit,
  };
}
