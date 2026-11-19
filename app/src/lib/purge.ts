// Ajustes > Apagar todas as transações: what the confirmation says, kept testable.
import type { BankPurge, PurgeOverview } from './types';
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

// Ajustes > Apagar as transações de um banco.
export function bankPurgeLines(b: BankPurge): string[] {
  const txs = plural(b.transactions, '1 transação', (n) => `${n} transações`);
  const waiting = b.to_review ? ` (${b.to_review} esperando revisão)` : '';
  const accounts = b.accounts.map((a) => a.name).join(', ');
  const from = plural(b.accounts.length, `da conta ${accounts}`, () => `das contas ${accounts}`);
  const lines = [`Vão embora ${txs}${waiting} do ${b.bank}, de todos os meses, ${from}.`];
  if (b.imports) {
    lines.push(
      plural(
        b.imports,
        'Sai também do histórico o envio de extrato que só tinha linhas dele.',
        (n) => `Saem também do histórico os ${n} envios de extrato que só tinham linhas dele.`,
      ),
    );
  }
  lines.push(
    'Transferências com outros bancos voltam para Transferências, esperando você dizer o que eram.',
  );
  lines.push('Ficam as contas, os outros bancos, as categorias, as regras e os responsáveis.');
  if (b.connected) {
    lines.push('O banco conectado lê o histórico de novo na próxima leitura, para você revisar.');
  }
  return lines;
}

export function bankPurgeButton(b: BankPurge): string {
  return plural(
    b.transactions,
    `Apagar 1 transação do ${b.bank}`,
    (n) => `Apagar ${n} transações do ${b.bank}`,
  );
}
