import { describe, expect, it } from '@jest/globals';

import { ApiError } from '@/lib/api';
import type { ImportPreview } from '@/lib/types';
import {
  accountIds,
  confirmBody,
  doneNote,
  doneTitle,
  errorText,
  fileDetails,
  fileNotes,
  historyLine,
  importLabel,
  initialChoices,
  namesOk,
  sinceOptions,
  totals,
} from '@/lib/upload';
import { group, preview, summary } from '@/testing/upload';

describe('upload choices', () => {
  it('keeps the account the server matched, or proposes a new one', () => {
    const p = preview({
      groups: [
        group({ currency: 'BRL', account: { id: 'a1', name: 'Nubank' } }),
        group({ currency: 'USD', suggested_name: 'Wise USD' }),
      ],
    });
    expect(initialChoices(p)).toEqual({
      BRL: { kind: 'existing', id: 'a1' },
      USD: { kind: 'new', name: 'Wise USD' },
    });
  });

  it('sends account ids for the preview and null for new accounts', () => {
    expect(
      accountIds({ BRL: { kind: 'existing', id: 'a1' }, EUR: { kind: 'new', name: 'x' } }),
    ).toEqual({ BRL: 'a1', EUR: null });
  });

  it('confirms existing accounts by id and new ones by trimmed name', () => {
    const groups = [group({ currency: 'BRL' }), group({ currency: 'USD', suggested_name: 'Wise' })];
    expect(
      confirmBody(groups, {
        BRL: { kind: 'existing', id: 'a1' },
        USD: { kind: 'new', name: ' Conta ' },
      }),
    ).toEqual([
      { currency: 'BRL', account_id: 'a1' },
      { currency: 'USD', new_account: { name: 'Conta' } },
    ]);
    expect(confirmBody(groups, {})[1]).toEqual({ currency: 'USD', new_account: { name: 'Wise' } });
  });

  it('needs a name for every new account', () => {
    const groups = [group()];
    expect(namesOk(groups, { BRL: { kind: 'new', name: 'Conta' } })).toBe(true);
    expect(namesOk(groups, { BRL: { kind: 'new', name: '   ' } })).toBe(false);
    expect(namesOk(groups, { BRL: { kind: 'existing', id: 'a' } })).toBe(true);
    expect(namesOk(groups, {})).toBe(true);
  });
});

describe('upload texts', () => {
  it('shows the server message or a generic one', () => {
    expect(errorText(new ApiError(422, 'Arquivo vazio'))).toBe('Arquivo vazio');
    expect(errorText(new Error('boom'))).toBe('Algo deu errado. Tente de novo.');
  });

  it('adds the counts of every currency', () => {
    expect(
      totals([
        group({ counts: { new: 2, duplicate: 1, skipped: 3 } }),
        group({ counts: { new: 5, duplicate: 0, skipped: 1 } }),
      ]),
    ).toEqual({ new: 7, duplicate: 1, skipped: 4 });
  });

  it('labels the import button by how many come in', () => {
    expect(importLabel(0)).toBe('Nada novo para importar');
    expect(importLabel(1)).toBe('Importar 1 transação');
    expect(importLabel(12)).toBe('Importar 12 transações');
  });

  it('describes the file: bank, card, currencies and period', () => {
    expect(fileDetails(preview({ is_card: true }))).toBe('Nubank · Cartão · BRL · 1 ago a 10 nov');
    expect(fileDetails(preview({ bank: null, period_start: null }))).toBe('BRL');
  });

  it('explains duplicates, transfers to confirm and lines left out', () => {
    const rows = [
      {
        index: 0,
        date: '2026-11-01',
        description: 'Pix',
        amount: '-1',
        currency: 'BRL',
        category: null,
        status: 'new',
        kind: 'pending',
      },
      {
        index: 1,
        date: '2026-11-01',
        description: 'Pix',
        amount: '-1',
        currency: 'BRL',
        category: null,
        status: 'duplicate',
        kind: 'pending',
      },
    ] as ImportPreview['rows'];
    expect(fileNotes(preview({ rows }), { new: 1, duplicate: 1, skipped: 1 })).toBe(
      '1 transação já estava no app e vai ser pulada. ' +
        '1 parece ir para uma conta sua: confirme depois em Transferências. ' +
        '1 fica de fora por ser anterior à data escolhida.',
    );
    const two = [rows[0], { ...rows[0], index: 2 }];
    expect(fileNotes(preview({ rows: two }), { new: 2, duplicate: 2, skipped: 2 })).toBe(
      '2 transações já estavam no app e vão ser puladas. ' +
        '2 parecem ir para contas suas: confirme depois em Transferências. ' +
        '2 ficam de fora por serem anteriores à data escolhida.',
    );
    expect(fileNotes(preview(), { new: 3, duplicate: 0, skipped: 0 })).toBe('');
  });

  it('offers shorter starts only for long statements', () => {
    expect(sinceOptions(preview({ period_start: '2026-08-01', period_end: '2026-11-10' }))).toEqual(
      [
        { label: 'Tudo, desde 1 ago', value: null },
        { label: 'Últimos 3 meses', value: '2026-08-12' },
        { label: 'Último mês', value: '2026-10-11' },
      ],
    );
    expect(sinceOptions(preview({ period_start: '2026-09-01', period_end: '2026-11-10' }))).toEqual(
      [
        { label: 'Tudo, desde 1 set', value: null },
        { label: 'Último mês', value: '2026-10-11' },
      ],
    );
    // 96 days: just past three months; 36 days: just past one month.
    expect(
      sinceOptions(preview({ period_start: '2026-08-06', period_end: '2026-11-10' })),
    ).toHaveLength(3);
    expect(
      sinceOptions(preview({ period_start: '2026-08-07', period_end: '2026-11-10' })),
    ).toHaveLength(2);
    expect(
      sinceOptions(preview({ period_start: '2026-10-05', period_end: '2026-11-10' })),
    ).toHaveLength(2);
    expect(sinceOptions(preview({ period_start: '2026-10-06', period_end: '2026-11-10' }))).toEqual(
      [],
    );
    expect(sinceOptions(preview({ period_start: null }))).toEqual([]);
    expect(sinceOptions(preview({ period_end: null }))).toEqual([]);
  });

  it('sums up a finished import', () => {
    expect(doneTitle(summary())).toBe('1 transação importada');
    expect(doneTitle(summary({ imported_count: 4 }))).toBe('4 transações importadas');
    expect(doneNote(summary())).toBe('extrato.csv');
    expect(doneNote(summary({ duplicate_count: 2, skipped_count: 3 }))).toBe(
      'extrato.csv · 2 já existiam · 3 fora do período',
    );
  });

  it('lists earlier uploads by day, imported and duplicates', () => {
    expect(historyLine(summary())).toBe('10 nov · 1 importada');
    expect(
      historyLine(
        summary({ imported_count: 5, duplicate_count: 2, finished_at: '2026-11-11T09:00:00Z' }),
      ),
    ).toBe('11 nov · 5 importadas · 2 já existiam');
  });
});
