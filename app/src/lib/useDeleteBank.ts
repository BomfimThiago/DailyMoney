import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { errorText } from './api';
import { deleteBankTransactions, getBankPurge } from './imports';
import { confirmed } from './purge';
import { useRefreshMoney } from './queries';

// Apagar as transações de um banco: open, pick the bank, see what goes, type APAGAR,
// delete. The server checks the count shown here: if lines arrived, nothing is deleted.
export function useDeleteBank() {
  const [open, setOpen] = useState(false);
  const [bank, setBank] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ bank: string; count: number } | null>(null);
  const refreshMoney = useRefreshMoney();
  const banks = useQuery({
    queryKey: ['money', 'purge', 'banks'],
    queryFn: getBankPurge,
    enabled: open,
  });
  const chosen = banks.data?.find((b) => b.bank === bank) ?? null;

  const close = () => {
    setOpen(false);
    setBank(null);
    setTyped('');
    setError(null);
  };

  const choose = (name: string) => {
    setBank(name);
    setTyped('');
    setError(null);
  };

  const submit = async () => {
    if (!chosen || !confirmed(typed) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteBankTransactions(chosen.bank, chosen.transactions);
      close();
      setRemoved({ bank: chosen.bank, count: result.removed });
      await refreshMoney();
    } catch (e) {
      setError(errorText(e));
      // The count changed (or something failed): count again for the next try.
      void banks.refetch();
    } finally {
      setBusy(false);
    }
  };

  return {
    open,
    bank,
    chosen,
    typed,
    busy,
    error,
    removed,
    banks,
    ready: confirmed(typed),
    start: () => {
      setRemoved(null);
      setOpen(true);
    },
    close,
    choose,
    setTyped,
    submit,
  };
}
