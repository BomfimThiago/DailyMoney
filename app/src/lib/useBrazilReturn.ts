// Back from Meu Pluggy: asks the server whether the bank is connected, and keeps asking
// for a while, because Pluggy may still be reading the bank after the authorization.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { errorText } from './api';
import { finishBrazilConnection } from './imports';
import type { BrazilFinish } from './types';

export const TRIES = 20;
export const PAUSE_MS = 3000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// The first answer that isn't "waiting"; "waiting" itself once the tries run out.
export async function waitForBrazil(
  finish: () => Promise<BrazilFinish> = finishBrazilConnection,
  wait: (ms: number) => Promise<void> = sleep,
  tries = TRIES,
): Promise<BrazilFinish> {
  let answer = await finish();
  for (let n = 1; n < tries && answer.status === 'waiting'; n += 1) {
    await wait(PAUSE_MS);
    answer = await finish();
  }
  return answer;
}

export function useBrazilReturn(signedIn: boolean) {
  const client = useQueryClient();
  const [answer, setAnswer] = useState<BrazilFinish | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    // React may run effects twice in development.
    if (started.current || !signedIn) return;
    started.current = true;
    waitForBrazil()
      .then(async (a) => {
        setAnswer(a);
        if (a.status === 'connected') await client.invalidateQueries({ queryKey: ['money'] });
      })
      .catch((e: unknown) => setError(errorText(e, 'Não deu para concluir a conexão.')));
  }, [signedIn, client]);
  return { answer, error };
}
