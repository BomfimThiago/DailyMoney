import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTabular } from "@/lib/tabular/pipeline";
import { dedupeHash } from "@/lib/ingest/dedupe";

const FIXTURES = resolve(__dirname, "../fixtures");

describe("dedupeHash", () => {
  // Bug real: a revisão calculava a chave com "-45.2000" (texto do leitor) e a
  // confirmação com "-45.2" (Decimal do banco): nunca batiam, e a revisão não
  // reconhecia transações já gravadas (em PDF, a prévia da reimportação saía errada).
  it("o mesmo valor escrito de formas diferentes gera a mesma chave", () => {
    const base = { bank: "", date: new Date("2026-10-01T00:00:00Z"), description: "Mercadona" };
    expect(dedupeHash({ ...base, baseAmount: "-45.2000" })).toBe(dedupeHash({ ...base, baseAmount: "-45.2" }));
    expect(dedupeHash({ ...base, baseAmount: "1234.5600" })).toBe(dedupeHash({ ...base, baseAmount: "1234.56" }));
    expect(dedupeHash({ ...base, baseAmount: "-45.2000" })).not.toBe(dedupeHash({ ...base, baseAmount: "-45.21" }));
  });

  // Bug real: duas transferências iguais (-100 EUR p/ a mesma pessoa) no mesmo
  // dia, minutos depois, eram fundidas em uma só no commit → perdia dinheiro.
  // A chave precisa do timestamp completo, não só do dia.
  it("não funde duas transações distintas do mesmo dia/valor/descrição (horário difere)", () => {
    const common = {
      bank: "Revolut",
      baseAmount: "-100.0000",
      description: "Transferencia a LISBETH CAROLINA VERA GAIBOR LISBETH",
    };
    const a = dedupeHash({ ...common, date: new Date("2026-07-03T09:16:58.000Z") });
    const b = dedupeHash({ ...common, date: new Date("2026-07-03T09:18:09.000Z") });
    expect(a).not.toBe(b);
  });

  it("funde a MESMA transação vista em dois extratos sobrepostos (timestamp idêntico)", () => {
    const row = {
      bank: "Revolut",
      baseAmount: "168.5000",
      description: "Transferencia de LISBETH",
      date: new Date("2026-07-31T10:04:58.000Z"),
    };
    expect(dedupeHash(row)).toBe(dedupeHash({ ...row }));
  });

  // Fixture real (Revolut): todas as 108 linhas são transações distintas —
  // nenhuma pode colidir por hash (senão o commit perderia transações reais).
  it("extrato Revolut real: nenhum hash colide falsamente", () => {
    const text = readFileSync(resolve(FIXTURES, "account-statement_2026-07-01_2026-07-31_es-es_0bd117.csv"), "utf8");
    const { applied } = parseTabular(text);
    const hashes = applied.rows.map((r) =>
      dedupeHash({ bank: "Revolut", date: r.date, baseAmount: r.baseAmount, description: r.description }),
    );
    expect(new Set(hashes).size).toBe(applied.rows.length);
  });
});
