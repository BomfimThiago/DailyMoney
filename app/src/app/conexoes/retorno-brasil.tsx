import { Redirect } from 'expo-router';

import {
  AlmostThere,
  Connected,
  NotConnected,
  ReturnPage,
  Working,
} from '@/components/connections/Return';
import { useAuth } from '@/lib/auth';
import type { BrazilFinish } from '@/lib/types';
import { useBrazilReturn } from '@/lib/useBrazilReturn';

// Where Meu Pluggy sends the person back after authorizing a Brazilian bank. Nothing is
// lost if this page never opens: the bank shows up in Conexões once Pluggy has read it.
export default function BrazilReturnScreen() {
  const { state } = useAuth();
  const { answer, error } = useBrazilReturn(state.status === 'signedIn');
  if (state.status === 'signedOut') return <Redirect href="/login" />;
  if (answer?.status === 'nothing') return <Redirect href="/conexoes" />;
  return (
    <ReturnPage>{error ? <NotConnected message={error} /> : <Answer answer={answer} />}</ReturnPage>
  );
}

function Answer({ answer }: { answer: BrazilFinish | null }) {
  if (!answer) return <Working text="Concluindo a conexão com o banco…" />;
  if (answer.status === 'connected') return <Connected results={answer.results} />;
  if (answer.status === 'waiting') {
    return (
      <AlmostThere message="O Meu Pluggy ainda está lendo o banco. Ele aparece em Conexões em alguns minutos." />
    );
  }
  return (
    <NotConnected message="A autorização não foi concluída no Meu Pluggy. Você pode tentar de novo." />
  );
}
