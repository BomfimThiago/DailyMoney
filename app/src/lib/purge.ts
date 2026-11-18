// Ajustes > Apagar todas as transações: what the confirmation says, kept testable.
import type { PurgeOverview } from './types';
import { plural } from './upload';

export const CONFIRM_WORD = 'APAGAR';

export function confirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === CONFIRM_WORD;
}

export function purgeLines(o: PurgeOverview): string[] {
  const txs = plural(o.transactions, '1 transação', (n) => `${n} transações`);
  const waiting = o.to_review ? ` (${o.to_review} esperando revisão)` : '';
  const imports = o.imports
    ? ` e ${plural(o.imports, 'o envio de extrato', (n) => `os ${n} envios de extrato`)}`
    : '';
  const lines = [`Vão embora ${txs}${waiting}, de todos os meses${imports}.`];
  lines.push('Ficam as contas, as categorias, as regras, os responsáveis e os bancos conectados.');
  if (o.banks) {
    lines.push(
      plural(
        o.banks,
        'O banco conectado lê o histórico de novo na próxima leitura, para você revisar.',
        (n) =>
          `Os ${n} bancos conectados leem o histórico de novo na próxima leitura, para você revisar.`,
      ),
    );
  }
  return lines;
}

export function purgeButton(o: PurgeOverview): string {
  return plural(o.transactions, 'Apagar 1 transação', (n) => `Apagar ${n} transações`);
}
