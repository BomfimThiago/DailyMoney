import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { dedupeHash } from "@/lib/ingest/dedupe";
import { contentHash, sourceKeys } from "@/lib/ingest/identity";

// O backfill roda em JS puro no container de produção, então repete as funções de
// chave. Se divergirem, a reimportação deixaria de reconhecer os dados antigos.
const require = createRequire(import.meta.url);
const js = require("../scripts/backfill-idempotency.cjs") as {
  dedupeHash: typeof dedupeHash;
  contentHash: typeof contentHash;
  sourceKeys: (rows: { sourceRowRaw?: string | null }[]) => (string | null)[];
};

describe("backfill-idempotency.cjs = app", () => {
  const cases = [
    { bank: "", date: new Date("2026-10-01T00:00:00Z"), baseAmount: "-45.2000", description: "Mercadona" },
    {
      bank: "Revolut",
      date: new Date("2026-07-03T09:16:58Z"),
      baseAmount: "1234.56",
      description: "  Transferencia  de LISBETH ",
    },
    { bank: "Wise", date: new Date("2026-08-31T00:00:00Z"), baseAmount: "0", description: "Taxa" },
  ];
  it("impressão digital igual", () => {
    for (const c of cases) expect(js.dedupeHash(c)).toBe(dedupeHash(c));
  });
  it("hash de arquivo e chaves de linha iguais", () => {
    const buf = Buffer.from("Fecha;Importe\n01/10;-1,00\n");
    expect(js.contentHash(buf)).toBe(contentHash(buf));
    const rows = [{ sourceRowRaw: "a;1" }, { sourceRowRaw: "a;1" }, { sourceRowRaw: "" }, { sourceRowRaw: " b;2 " }];
    expect(js.sourceKeys(rows)).toEqual(sourceKeys(rows, true));
  });
});
