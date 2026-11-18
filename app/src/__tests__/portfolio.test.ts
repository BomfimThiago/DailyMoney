import { describe, expect, it } from '@jest/globals';

import {
  banksLine,
  classSub,
  emptyText,
  finding,
  gainSub,
  gainText,
  historyPoints,
  historyRange,
  ladderFinding,
  ladderHeights,
  maturingSub,
  percent,
  positionNote,
  positionSub,
  shade,
  sourceNote,
  totalSub,
  undatedText,
} from '@/lib/portfolio';
import { emptyPortfolio, portfolio, position } from '@/testing/portfolio';

// Spaces inside formatted money are non-breaking.
const nb = (s: string | null) => s?.replace(/\s/g, ' ');

describe('portfolio texts', () => {
  it('describes the total, the gain and what matures', () => {
    const p = portfolio();
    expect(percent('0.7333')).toBe('73%');
    expect(totalSub(p)).toBe('2 investimentos · saldo de 16/11');
    expect(totalSub(portfolio({ count: 1, value_date: null }))).toBe('1 investimento');
    expect(nb(gainText(p))).toBe('+R$ 100,00 (+10,0%)');
    expect(nb(gainSub(p))).toBe('sobre R$ 1.000,00 aplicados em renda fixa e Tesouro');
    expect(maturingSub(p)).toBe('1 título');
    expect(maturingSub(portfolio({ maturing: { months: 12, count: 0, total: '0' } }))).toBe(
      'nenhum título',
    );
  });

  it('handles a loss, an unknown percent and no amount put in', () => {
    const loss = portfolio({
      tracked: { invested: '100', value: '90', gain: '-10', gain_pct: '-10.0' },
    });
    expect(nb(gainText(loss))).toBe('-R$ 10,00 (-10,0%)');
    const zero = portfolio({ tracked: { invested: '0', value: '5', gain: '5', gain_pct: null } });
    expect(nb(gainText(zero))).toBe('+R$ 5,00');
    expect(gainText(emptyPortfolio())).toBeNull();
    expect(gainSub(emptyPortfolio())).toBe('o banco não informa o aplicado');
  });

  it('names the banks only when there are several', () => {
    expect(nb(banksLine(portfolio()))).toBe('Nubank R$ 1.100,00 · Inter R$ 400,00');
    expect(banksLine(portfolio({ banks: [{ bank: 'Inter', total: '1' }] }))).toBeNull();
  });

  it('says where most of the money is', () => {
    expect(finding(portfolio())).toBe('73% em renda fixa, 27% em ETFs.');
    const one = portfolio().classes.slice(1);
    expect(finding(portfolio({ classes: one }))).toBe('Tudo em ETFs.');
    expect(finding(emptyPortfolio())).toBeNull();
  });

  it('describes each position', () => {
    expect(positionSub(position())).toBe('Nubank · 110% do CDI · vence 15/03/2027');
    expect(positionSub(position({ rate_label: null, due_date: null }))).toBe('Nubank');
    expect(
      positionSub(position({ code: 'LCI123', issuer: 'Banco Exemplo Sul', due_date: null })),
    ).toBe('LCI123 · Nubank · Banco Exemplo Sul · 110% do CDI');
    // Not the issuer already in the name, nor the bank itself, nor a code equal to the name.
    expect(
      positionSub(
        position({
          name: 'BOVA11',
          code: 'BOVA11',
          issuer: 'Nubank S.A.',
          rate_label: null,
          due_date: null,
        }),
      ),
    ).toBe('Nubank');
    expect(
      positionSub(position({ issuer: 'Banco Exemplo', rate_label: null, due_date: null })),
    ).toBe('Nubank');
    expect(nb(positionNote(position(), 'BRL'))).toBe('+R$ 100,00 rendeu');
    const usd = position({ gain: null, currency: 'USD', balance: '20.0000' });
    expect(nb(positionNote(usd, 'BRL'))).toBe('US$ 20,00');
    expect(positionNote(position({ gain: null }), 'BRL')).toBeNull();
  });

  it('describes each type, the peak year and where the balances come from', () => {
    const p = portfolio();
    expect(classSub(p.classes[1])).toBe('27% da carteira · 1 investimento');
    expect(nb(ladderFinding(p))).toMatch(
      /^O maior volume volta em 2027: R\$ 1\.100,00 em 1 título\.$/,
    );
    expect(ladderFinding(emptyPortfolio())).toBeNull();
    expect(
      nb(
        ladderFinding(
          portfolio({
            ladder: {
              steps: [
                { label: '2027', year: 2027, total: '100', count: 1 },
                { label: '2031+', year: 2031, total: '900', count: 2 },
              ],
              dated_total: '1000',
              dated_count: 3,
              undated_total: '0',
              undated_count: 0,
            },
          }),
        ),
      ),
    ).toBe('O maior volume volta de 2031 em diante: R$ 900,00 em 2 títulos.');
    expect(sourceNote(p)).toBe(
      'Saldo líquido (já sem IR e taxas) informado pelos bancos em 16/11, atualizado a cada sincronização.',
    );
    expect(sourceNote(emptyPortfolio())).toMatch(
      /^Saldo líquido \(já sem IR e taxas\) informado pelos bancos,/,
    );
  });

  it('shades the classes and stops at the lightest', () => {
    expect(shade(0)).toBe(1);
    expect(shade(99)).toBe(0.08);
  });

  it('draws the history and the ladder', () => {
    const pts = historyPoints(portfolio().history, 100, 50);
    expect(pts).toEqual([
      { x: 0, y: 44 },
      { x: 100, y: 6 },
    ]);
    const flat = historyPoints(
      [
        { date: '2026-01-01', total: '0' },
        { date: '2026-01-02', total: '0' },
      ],
      10,
      20,
    );
    expect(flat?.map((p) => p.y)).toEqual([14, 14]);
    expect(historyPoints([], 10, 10)).toBeNull();
    expect(historyRange(portfolio().history)).toBe('16/10/2026 a 16/11/2026');
    expect(historyRange([])).toBeNull();
    expect(ladderHeights(portfolio().ladder!.steps)).toEqual([0, 72]);
    expect(
      ladderHeights([
        { label: 'a', year: 1, total: '1', count: 1 },
        { label: 'b', year: 2, total: '1000', count: 1 },
      ]),
    ).toEqual([3, 72]);
    expect(nb(undatedText(portfolio()))).toBe(
      'R$ 400,00 sem vencimento (ações, fundos, liquidez diária)',
    );
    expect(undatedText(emptyPortfolio())).toBeNull();
  });

  it('says what to do when there is nothing', () => {
    expect(emptyText(emptyPortfolio())).toMatch(/^Conecte o Nubank ou o Inter/);
    expect(emptyText(emptyPortfolio({ has_source: true }))).toMatch(/ainda não informou/);
  });
});
