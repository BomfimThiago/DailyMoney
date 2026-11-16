import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Connected, NotConnected, ReturnPage, Working } from '@/components/connections/Return';
import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { finishConnection } from '@/lib/imports';
import type { SyncResult } from '@/lib/types';

type Params = { code?: string; state?: string; error?: string };

// Where the bank sends the person back after authorizing (Enable Banking): saves the
// connection and reads it right away.
export default function ConnectionReturnScreen() {
  const params = useLocalSearchParams<Params>();
  const { state } = useAuth();
  const { result, error } = useFinishConnection(params, state.status === 'signedIn');
  if (state.status === 'signedOut') return <Redirect href="/login" />;
  const refused = params.error || !params.code || !params.state;
  const shown = refused ? 'O banco não autorizou a conexão. Você pode tentar de novo.' : error;
  return (
    <ReturnPage>
      {shown ? <NotConnected message={shown} /> : <Reading result={result} />}
    </ReturnPage>
  );
}

// The code works once, so the connection is finished a single time, after sign-in.
function useFinishConnection({ code, state }: Params, signedIn: boolean) {
  const client = useQueryClient();
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    // React may run effects twice in development.
    if (started.current || !signedIn || !code || !state) return;
    started.current = true;
    finishConnection(code, state)
      .then(async (r) => {
        setResult(r);
        await client.invalidateQueries({ queryKey: ['money'] });
      })
      .catch((e: unknown) => setError(errorText(e, 'Não deu para concluir a conexão.')));
  }, [code, state, signedIn, client]);
  return { result, error };
}

function Reading({ result }: { result: SyncResult | null }) {
  if (!result) return <Working text="Lendo as transações do banco…" />;
  return <Connected results={[result]} />;
}
