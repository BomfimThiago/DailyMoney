// Transações > Transferências > Conferência: the words of the movements check.
import { money } from './format';
import type { MovementGroup, MovementRow } from './types';

export function movementSub(r: MovementRow, g: MovementGroup): string {
  const parts = [];
  if (Number(r.went_out)) parts.push(`saiu ${money(r.went_out, g.currency)}`);
  if (Number(r.came_in)) parts.push(`entrou ${money(r.came_in, g.currency)}`);
  return parts.join(' · ');
}

export function movementResult(g: MovementGroup): { title: string; note: string } {
  if (g.result === 'closed') {
    return { title: 'Fechou', note: 'O que saiu de uma conta entrou em outra.' };
  }
  if (g.result === 'out') {
    return {
      title: 'Saiu e não voltou',
      note: 'Foi para contas que ainda não estão no app, ou o outro lado ainda não foi importado.',
    };
  }
  return {
    title: 'Entrou de fora',
    note: 'Veio de contas que ainda não estão no app, ou o outro lado ainda não foi importado.',
  };
}
