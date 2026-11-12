// What the statement upload screen decides, kept apart from the screen so it can be tested.
import { ApiError } from './api';
import { addDays, dayMonth, daysBetween, period } from './format';
import type {
  AccountChoice,
  Currency,
  GroupCounts,
  ImportPreview,
  ImportSummary,
  PreviewGroup,
} from './types';

export type Choice = { kind: 'existing'; id: string } | { kind: 'new'; name: string };
export type Choices = Partial<Record<Currency, Choice>>;

export const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR'];

export function errorText(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Algo deu errado. Tente de novo.';
}

// "1 transação" or "3 transações": the singular sentence is written out in full.
export function plural(n: number, one: string, many: (n: number) => string): string {
  return n === 1 ? one : many(n);
}

export function initialChoices(preview: ImportPreview): Choices {
  const out: Choices = {};
  for (const g of preview.groups) {
    out[g.currency] = g.account
      ? { kind: 'existing', id: g.account.id }
      : { kind: 'new', name: g.suggested_name };
  }
  return out;
}

export function totals(groups: PreviewGroup[]): GroupCounts {
  return groups.reduce(
    (acc, g) => ({
      new: acc.new + g.counts.new,
      duplicate: acc.duplicate + g.counts.duplicate,
      skipped: acc.skipped + g.counts.skipped,
    }),
    { new: 0, duplicate: 0, skipped: 0 },
  );
}

// For the preview: an existing account by id, or null while the account is still new.
export function accountIds(choices: Choices): Partial<Record<Currency, string | null>> {
  const out: Partial<Record<Currency, string | null>> = {};
  for (const [currency, c] of Object.entries(choices) as [Currency, Choice][]) {
    out[currency] = c.kind === 'existing' ? c.id : null;
  }
  return out;
}

export function confirmBody(groups: PreviewGroup[], choices: Choices): AccountChoice[] {
  return groups.map((g) => {
    const c = choices[g.currency];
    return c?.kind === 'existing'
      ? { currency: g.currency, account_id: c.id }
      : { currency: g.currency, new_account: { name: (c?.name ?? g.suggested_name).trim() } };
  });
}

export function namesOk(groups: PreviewGroup[], choices: Choices): boolean {
  return groups.every((g) => {
    const c = choices[g.currency];
    return c?.kind !== 'new' || c.name.trim().length > 0;
  });
}

export function importLabel(n: number): string {
  if (n === 0) return 'Nada novo para importar';
  return plural(n, 'Importar 1 transação', (k) => `Importar ${k} transações`);
}

export function fileDetails(preview: ImportPreview): string {
  return [
    preview.bank,
    preview.is_card ? 'Cartão' : null,
    preview.groups.map((g) => g.currency).join(' + '),
    period(preview.period_start, preview.period_end),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function fileNotes(preview: ImportPreview, count: GroupCounts): string {
  const pending = preview.rows.filter((r) => r.status === 'new' && r.kind === 'pending').length;
  const notes = [
    count.duplicate
      ? plural(
          count.duplicate,
          '1 transação já estava no app e vai ser pulada.',
          (n) => `${n} transações já estavam no app e vão ser puladas.`,
        )
      : null,
    pending
      ? plural(
          pending,
          '1 parece ir para uma conta sua: confirme depois em Transferências.',
          (n) => `${n} parecem ir para contas suas: confirme depois em Transferências.`,
        )
      : null,
    count.skipped
      ? plural(
          count.skipped,
          '1 fica de fora por ser anterior à data escolhida.',
          (n) => `${n} ficam de fora por serem anteriores à data escolhida.`,
        )
      : null,
  ];
  return notes.filter(Boolean).join(' ');
}

export type SinceOption = { label: string; value: string | null };

// Only offered when the statement is long enough for a shorter start to matter.
export function sinceOptions(preview: ImportPreview): SinceOption[] {
  const { period_start: start, period_end: end } = preview;
  if (!start || !end) return [];
  const span = daysBetween(start, end);
  const options: SinceOption[] = [{ label: `Tudo, desde ${dayMonth(start)}`, value: null }];
  if (span > 95) options.push({ label: 'Últimos 3 meses', value: addDays(end, -90) });
  if (span > 35) options.push({ label: 'Último mês', value: addDays(end, -30) });
  return options.length > 1 ? options : [];
}

export function doneTitle(summary: ImportSummary): string {
  return plural(
    summary.imported_count,
    '1 transação importada',
    (n) => `${n} transações importadas`,
  );
}

export function doneNote(summary: ImportSummary): string {
  const extra = [
    summary.duplicate_count ? `${summary.duplicate_count} já existiam` : null,
    summary.skipped_count ? `${summary.skipped_count} fora do período` : null,
  ].filter(Boolean);
  return [summary.filename, ...extra].join(' · ');
}

export function historyLine(h: ImportSummary): string {
  return [
    dayMonth(h.finished_at ?? h.created_at),
    plural(h.imported_count, '1 importada', (n) => `${n} importadas`),
    h.duplicate_count ? `${h.duplicate_count} já existiam` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
