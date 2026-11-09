import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchAcrossSources, type ExistingTx, type IncomingRow } from "@/lib/ingest/cross-source";
import { parseTabular } from "@/lib/tabular/pipeline";
import { parseOfx } from "@/lib/ingest/ofx";
import { mapAccountTransactions } from "@/lib/pluggy/map";
import { PluggyAccount, PluggyTransaction } from "@/lib/pluggy/schemas";

const inc = (day: string, amount: string, description = "x"): IncomingRow => ({
  day,
  currency: "BRL",
  amount,
  description,
});
const ex = (id: string, day: string, amount: string, description = "y", source = "arquivo"): ExistingTx => ({
  id,
  source,
  ...inc(day, amount, description),
});

describe("mesma transação de outra fonte (arquivo × banco conectado)", () => {
  it("dia inteiro igual: nenhuma linha entra, mesmo com descrições diferentes", () => {
    const m = matchAcrossSources(
      [
        inc("2026-11-02", "-5600", "Transferência enviada pelo Pix|Vitor"),
        inc("2026-11-02", "250", "Transferência Recebida|Alexandre"),
      ],
      [
        ex("a", "2026-11-02", "250", "Transferência recebida pelo Pix - ALEXANDRE - •••"),
        ex("b", "2026-11-02", "-5600", "Transferência enviada pelo Pix - Vitor - •••"),
      ],
    );
    expect(m).toEqual([
      { existingId: "b", confident: true },
      { existingId: "a", confident: true },
    ]);
  });

  it("uma fonte divide o que a outra junta: o dia fecha e as partes também não entram", () => {
    const m = matchAcrossSources(
      [inc("2026-10-15", "-100"), inc("2026-10-15", "-30"), inc("2026-10-15", "0.06"), inc("2026-10-15", "0.04")],
      [ex("a", "2026-10-15", "-100"), ex("c", "2026-10-15", "-30"), ex("b", "2026-10-15", "0.10", "Crédito em conta")],
    );
    expect(m.map((x) => x?.confident)).toEqual([true, true, true, true]);
    expect(m.map((x) => x?.existingId)).toEqual(["a", "c", "b", "b"]);
  });

  it("duas compras iguais reais no mesmo dia, só uma já gravada: o dia não fecha, nada é pulado", () => {
    const m = matchAcrossSources([inc("2026-11-03", "-50"), inc("2026-11-03", "-50")], [ex("a", "2026-11-03", "-50")]);
    // Uma vira "possível" (o usuário decide); a outra entra.
    expect(m.filter((x) => x?.confident)).toHaveLength(0);
    expect(m.filter((x) => x && !x.confident)).toHaveLength(1);
    expect(m.filter((x) => !x)).toHaveLength(1);
  });

  it("dia pequeno com só uma linha em comum não fecha: vira possível, não some", () => {
    const m = matchAcrossSources(
      [inc("2026-10-15", "-100"), inc("2026-10-15", "0.06"), inc("2026-10-15", "0.04")],
      [ex("a", "2026-10-15", "-100"), ex("b", "2026-10-15", "0.10")],
    );
    expect(m).toEqual([{ existingId: "a", confident: false }, null, null]);
  });

  it("valor igual em outro dia ou outra moeda não casa", () => {
    expect(matchAcrossSources([inc("2026-11-03", "-50")], [ex("a", "2026-11-04", "-50")])).toEqual([null]);
    expect(
      matchAcrossSources([{ ...inc("2026-11-03", "-50"), currency: "EUR" }], [ex("a", "2026-11-03", "-50")]),
    ).toEqual([null]);
  });

  it("dia que soma zero só fecha se todas as linhas têm par", () => {
    const m = matchAcrossSources(
      [inc("2026-11-03", "-10"), inc("2026-11-03", "10")],
      [ex("a", "2026-11-03", "-7"), ex("b", "2026-11-03", "7")],
    );
    expect(m).toEqual([null, null]);
  });

  it("compara o dia com cada fonte separada (a conta não se mistura com o cartão)", () => {
    const m = matchAcrossSources(
      [inc("2026-11-02", "-30"), inc("2026-11-02", "-20")],
      [
        ex("conta1", "2026-11-02", "-30", "y", "csv-conta"),
        ex("conta2", "2026-11-02", "-20", "y", "csv-conta"),
        ex("cartao", "2026-11-02", "-99", "y", "pluggy-cartao"),
      ],
    );
    expect(m).toEqual([
      { existingId: "conta1", confident: true },
      { existingId: "conta2", confident: true },
    ]);
  });
});

describe("extrato baixado no meio do dia (dia de borda)", () => {
  // Arquivo baixado às 17h de 04/11: tem 3 das 5 transações do dia. A sincronização
  // de depois traz o dia inteiro.
  const file = [
    ex("f1", "2026-11-04", "-40", "Compra no débito - Mercado", "arquivo"),
    ex("f2", "2026-11-04", "-12", "Compra no débito - Padaria", "arquivo"),
    ex("f3", "2026-11-04", "300", "Transferência recebida pelo Pix - Ana", "arquivo"),
  ];
  const sync = [
    inc("2026-11-04", "-40", "Compra no débito|Mercado"),
    inc("2026-11-04", "-12", "Compra no débito|Padaria"),
    inc("2026-11-04", "300", "Transferência Recebida|Ana"),
    inc("2026-11-04", "-25", "Compra no débito|Farmácia"), // depois das 17h
    inc("2026-11-04", "-60", "Compra no débito|Restaurante"), // depois das 17h
  ];
  const fileCoverage = { sources: new Map([["arquivo", { first: "2026-10-01", last: "2026-11-04" }]]) };

  it("sincronização depois: as 3 do arquivo não entram de novo, as 2 da noite entram", () => {
    const m = matchAcrossSources(sync, file, fileCoverage);
    expect(m).toEqual([
      { existingId: "f1", confident: true },
      { existingId: "f2", confident: true },
      { existingId: "f3", confident: true },
      null,
      null,
    ]);
  });

  it("arquivo depois (o banco já tinha o dia inteiro): nada do arquivo entra", () => {
    const stored = sync.map((r, i) => ({ ...r, id: `p${i}`, source: "pluggy" }));
    const arriving = file.map(({ id: _id, source: _s, ...r }) => r);
    const m = matchAcrossSources(arriving, stored, { incoming: { first: "2026-10-01", last: "2026-11-04" } });
    expect(m.map((x) => x && x.confident)).toEqual([true, true, true]);
  });

  it("o mesmo dia no meio do período (não é borda) não fecha: vira possível, não some", () => {
    const m = matchAcrossSources(sync, file, {
      sources: new Map([["arquivo", { first: "2026-10-01", last: "2026-11-30" }]]),
    });
    expect(m.filter((x) => x?.confident)).toHaveLength(0);
    expect(m.filter((x) => x && !x.confident)).toHaveLength(3);
  });

  it("borda com uma linha só: valor igual sem palavra em comum não basta", () => {
    const one = [ex("f1", "2026-11-04", "-50", "Transferência enviada pelo Pix - João", "arquivo")];
    const m = matchAcrossSources(
      [inc("2026-11-04", "-50", "Uber Trip"), inc("2026-11-04", "-9", "Café")],
      one,
      fileCoverage,
    );
    expect(m).toEqual([{ existingId: "f1", confident: false }, null]);
  });

  it("borda em que uma fonte divide o que a outra junta", () => {
    const part = [
      ex("f1", "2026-11-04", "-40", "Mercado", "arquivo"),
      ex("f2", "2026-11-04", "0.10", "Crédito em conta", "arquivo"),
    ];
    const m = matchAcrossSources(
      [
        inc("2026-11-04", "-40", "Mercado"),
        inc("2026-11-04", "0.06"),
        inc("2026-11-04", "0.04"),
        inc("2026-11-04", "-25"),
      ],
      part,
      fileCoverage,
    );
    expect(m).toEqual([
      { existingId: "f1", confident: true },
      { existingId: "f2", confident: true },
      { existingId: "f2", confident: true },
      null,
    ]);
  });
});

// Extratos reais (fora do git): o mesmo Nubank por CSV, OFX e Pluggy.
const FIX = resolve(__dirname, "../fixtures");
const files = {
  csvOct: resolve(FIX, "NU_857376284_01OUT2026_31OUT2026.csv"),
  csvNov: resolve(FIX, "NU_857376284_01NOV2026_04NOV2026.csv"),
  ofxOct: resolve(FIX, "NU_857376284_01OUT2026_31OUT2026.ofx"),
  ofxNov: resolve(FIX, "NU_857376284_01NOV2026_04NOV2026.ofx"),
  bank: resolve(FIX, "pluggy/a8bfdbdd-bank.json"),
  card: resolve(FIX, "pluggy/a8bfdbdd-credit.json"),
};
const haveAll = Object.values(files).every(existsSync);

type Row = { date: Date; baseAmount: string; baseCurrency: string; description: string };
const day = (d: Date) => d.toISOString().slice(0, 10);
const pluggy = (path: string) => {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const account = PluggyAccount.parse(raw.account);
  return mapAccountTransactions(account, PluggyTransaction.array().parse(raw.transactions), { from: new Date(0) })
    .rows as Row[];
};
/** Linhas que chegam nos dias que a outra fonte também tem; resultado do casamento. */
function compare(incoming: Row[], existing: Row[]) {
  const days = new Set(existing.map((r) => day(r.date)));
  const inn = incoming.filter((r) => days.has(day(r.date)));
  const toRow = (r: Row) => ({
    day: day(r.date),
    currency: r.baseCurrency,
    amount: r.baseAmount,
    description: r.description,
  });
  const m = matchAcrossSources(
    inn.map(toRow),
    existing.map((r, i) => ({ id: String(i), source: "outra", ...toRow(r) })),
  );
  return {
    total: inn.length,
    confident: m.filter((x) => x?.confident).length,
    possible: m.filter((x) => x && !x.confident).length,
  };
}

describe.skipIf(!haveAll)("Nubank real: CSV × OFX × Pluggy", () => {
  const csv = () =>
    [
      ...parseTabular(readFileSync(files.csvOct, "utf8")).applied.rows,
      ...parseTabular(readFileSync(files.csvNov, "utf8")).applied.rows,
    ] as Row[];
  const ofx = () =>
    [
      ...parseOfx(readFileSync(files.ofxOct, "utf8")).rows,
      ...parseOfx(readFileSync(files.ofxNov, "utf8")).rows,
    ] as Row[];

  it.each([
    ["Pluggy conta chegando, CSV gravado", () => compare(pluggy(files.bank), csv())],
    ["CSV chegando, Pluggy conta gravada", () => compare(csv(), pluggy(files.bank))],
    ["OFX chegando, CSV gravado", () => compare(ofx(), csv())],
    ["OFX chegando, Pluggy conta gravada", () => compare(ofx(), pluggy(files.bank))],
  ])("%s: toda linha dos dias em comum é reconhecida", (_name, run) => {
    const r = run();
    expect(r.total).toBeGreaterThan(50);
    expect(r).toEqual({ total: r.total, confident: r.total, possible: 0 });
  });

  it.each([
    ["cartão chegando, conta (CSV) gravada", () => compare(pluggy(files.card), csv())],
    ["cartão chegando, conta (Pluggy) gravada", () => compare(pluggy(files.card), pluggy(files.bank))],
    ["conta (Pluggy) chegando, cartão gravado", () => compare(pluggy(files.bank), pluggy(files.card))],
  ])("%s: nada é pulado", (_name, run) => {
    expect(run().confident).toBe(0);
  });
  it("arquivo cortado em qualquer ponto de qualquer dia: nunca pula demais, e quase sempre resolve sozinho", () => {
    const all = csv();
    const bank = pluggy(files.bank);
    const toRow = (r: Row) => ({
      day: day(r.date),
      currency: r.baseCurrency,
      amount: r.baseAmount,
      description: r.description,
    });
    let solved = 0,
      cases = 0;
    for (const d of [...new Set(all.map((r) => day(r.date)))]) {
      const dayRows = all.filter((r) => day(r.date) === d);
      for (let keep = 1; keep < dayRows.length; keep++) {
        const kept = dayRows.slice(0, keep);
        const first = day(all[0].date);
        for (const [incoming, existing, cov] of [
          [bank, kept, { sources: new Map([["f", { first, last: d }]]) }],
          [kept, bank, { incoming: { first, last: d } }],
        ] as const) {
          const inn = (incoming as Row[]).filter((r) => day(r.date) === d);
          const ex = (existing as Row[]).filter((r) => day(r.date) === d);
          const m = matchAcrossSources(
            inn.map(toRow),
            ex.map((r, i) => ({ id: String(i), source: "f", ...toRow(r) })),
            cov,
          );
          const confident = m.filter((x) => x?.confident).length;
          // Nunca mais linhas puladas do que o lado maior pode ter de repetidas.
          expect(confident).toBeLessThanOrEqual(inn.length);
          if (incoming === bank)
            expect(inn.length - confident).toBeGreaterThanOrEqual(inn.length - pluggySameDay(bank, kept, d));
          cases++;
          if (confident >= Math.min(inn.length, ex.length)) solved++;
        }
      }
    }
    // Medido: 116 de 130. Os outros 14 vão para a revisão como "possível" (10 são cortes
    // com uma linha só do dia, em que valor igual sozinho não é prova suficiente).
    expect(solved / cases).toBeGreaterThanOrEqual(0.85);
  });

  it("cartão contra conta, tratando todo dia como borda (pior caso): nada é pulado", () => {
    const toRow = (r: Row) => ({
      day: day(r.date),
      currency: r.baseCurrency,
      amount: r.baseAmount,
      description: r.description,
    });
    const card = pluggy(files.card);
    for (const [inc, exs] of [
      [card, csv()],
      [card, pluggy(files.bank)],
      [pluggy(files.bank), card],
      [csv(), card],
    ]) {
      for (const d of new Set(inc.map((r) => day(r.date)))) {
        const ex = exs.filter((r) => day(r.date) === d);
        if (!ex.length) continue;
        const m = matchAcrossSources(
          inc.filter((r) => day(r.date) === d).map(toRow),
          ex.map((r, i) => ({ id: String(i), source: "f", ...toRow(r) })),
          { incoming: { first: d, last: d }, sources: new Map([["f", { first: d, last: d }]]) },
        );
        expect(m.filter((x) => x?.confident)).toHaveLength(0);
      }
    }
  });
});

/** Quantas linhas da Pluggy no dia `d` podem ser as do arquivo cortado (teto do que pode sumir). */
function pluggySameDay(bank: Row[], kept: Row[], d: string): number {
  const inDay = bank.filter((r) => day(r.date) === d).length;
  // Cada linha do arquivo vira no máximo 3 da Pluggy (partida dividida).
  return Math.min(inDay, kept.length * 3);
}
