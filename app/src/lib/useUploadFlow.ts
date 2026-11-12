import { useCallback, useRef, useState } from 'react';

import {
  cancelImport,
  confirmImport,
  refreshPreview,
  uploadStatement,
  type PickedFile,
} from './imports';
import { useRefreshMoney } from './queries';
import type { Currency, ImportPreview, ImportSummary } from './types';
import {
  accountIds,
  confirmBody,
  errorText,
  initialChoices,
  type Choice,
  type Choices,
} from './upload';

type Setters = {
  setPreview: (p: ImportPreview) => void;
  setError: (e: string) => void;
};

// Changing an account or the start date asks the server for a new preview. Only the
// answer to the latest change counts; older answers arrive too late.
function useAdjustments(preview: ImportPreview | null, { setPreview, setError }: Setters) {
  const [choices, setChoices] = useState<Choices>({});
  const [since, setSince] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);

  const refresh = async (next: Choices, nextSince: string | null) => {
    if (!preview) return;
    const id = ++request.current;
    const latest = () => id === request.current;
    setRefreshing(true);
    try {
      const result = await refreshPreview(preview.id, accountIds(next), nextSince);
      if (latest()) setPreview(result);
    } catch (e) {
      if (latest()) setError(errorText(e));
    } finally {
      if (latest()) setRefreshing(false);
    }
  };

  return {
    choices,
    since,
    refreshing,
    start: useCallback((next: Choices) => {
      setChoices(next);
      setSince(null);
    }, []),
    selectAccount: (currency: Currency, choice: Choice) => {
      const next = { ...choices, [currency]: choice };
      setChoices(next);
      void refresh(next, since);
    },
    renameNew: (currency: Currency, name: string) => {
      setChoices({ ...choices, [currency]: { kind: 'new', name } });
    },
    selectSince: (value: string | null) => {
      setSince(value);
      void refresh(choices, value);
    },
  };
}

// Sending one statement: read it, adjust accounts and start date, then import or cancel.
export function useUploadFlow() {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ImportSummary | null>(null);
  const adjust = useAdjustments(preview, { setPreview, setError });
  // A new import changes every money screen, not just the lists here.
  const refreshMoney = useRefreshMoney();

  // Stable, so the screen can run it when the person leaves the page.
  const { start } = adjust;
  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setError(null);
    setDone(null);
    start({});
  }, [start]);

  const read = async (picked: PickedFile, currency?: Currency) => {
    reset();
    setFile(picked);
    setReading(true);
    try {
      const result = await uploadStatement(picked, currency);
      setPreview(result);
      start(initialChoices(result));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setReading(false);
    }
  };

  const chooseCurrency = async (currency: Currency) => {
    if (!file || !preview) return;
    // The first try created an empty import; close it before sending again.
    cancelImport(preview.id).catch(() => undefined);
    await read(file, currency);
  };

  const cancel = async () => {
    if (preview) await cancelImport(preview.id).catch(() => undefined);
    reset();
    refreshMoney();
  };

  const submit = async () => {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const body = confirmBody(preview.groups, adjust.choices);
      const summary = await confirmImport(preview.id, body, adjust.since);
      reset();
      setDone(summary);
      refreshMoney();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setImporting(false);
    }
  };

  return {
    ...adjust,
    preview,
    reading,
    importing,
    error,
    done,
    busy: reading || importing,
    reset,
    read,
    chooseCurrency,
    cancel,
    submit,
  };
}

export type UploadFlow = ReturnType<typeof useUploadFlow>;
