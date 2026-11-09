import { describe, expect, it } from "vitest";
import { changedFields, contentHash, sourceKeys } from "@/lib/ingest/identity";

describe("contentHash", () => {
  it("é o mesmo para o mesmo conteúdo, independente do nome do arquivo", () => {
    const a = contentHash(Buffer.from("data;valor\n01/11/2026;-12,50\n"));
    const b = contentHash(Buffer.from("data;valor\n01/11/2026;-12,50\n"));
    expect(a).toBe(b);
    expect(contentHash(Buffer.from("data;valor\n01/11/2026;-12,51\n"))).not.toBe(a);
  });
});

describe("sourceKeys", () => {
  it("depende só do texto bruto da linha, não do que foi lido dela", () => {
    const [k1] = sourceKeys([{ sourceRowRaw: "01/11/2026;Mercadona;-1.234,56" }], true);
    const [k2] = sourceKeys([{ sourceRowRaw: "  01/11/2026;Mercadona;-1.234,56  " }], true);
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("linhas idênticas no mesmo arquivo não colidem (1ª, 2ª ocorrência)", () => {
    const keys = sourceKeys(
      [
        { sourceRowRaw: "05/11;Bizum;-25,00" },
        { sourceRowRaw: "05/11;Bizum;-25,00" },
        { sourceRowRaw: "06/11;Cabify;-9" },
      ],
      true,
    );
    expect(new Set(keys).size).toBe(3);
    // A mesma sequência gera as mesmas chaves (reimportar o mesmo arquivo).
    expect(
      sourceKeys(
        [
          { sourceRowRaw: "05/11;Bizum;-25,00" },
          { sourceRowRaw: "05/11;Bizum;-25,00" },
          { sourceRowRaw: "06/11;Cabify;-9" },
        ],
        true,
      ),
    ).toEqual(keys);
  });

  it("PDF/foto (lidos por IA) e linhas sem texto não têm chave", () => {
    expect(sourceKeys([{ sourceRowRaw: '{"amount":-3}' }], false)).toEqual([null]);
    expect(sourceKeys([{ sourceRowRaw: "" }, {}], true)).toEqual([null, null]);
  });
});

describe("changedFields", () => {
  const base = {
    date: new Date("2026-11-01T00:00:00Z"),
    description: "Mercadona",
    baseAmount: "-1234.5600",
    baseCurrency: "EUR",
    feeAmount: "0",
    type: "EXPENSE",
    state: "COMPLETED",
  };
  it("igual quando só muda a representação do número", () => {
    expect(changedFields(base, { ...base, baseAmount: "-1234.56", feeAmount: "0.0000" })).toEqual([]);
  });
  it("aponta o que o leitor corrigiu", () => {
    expect(changedFields({ ...base, baseAmount: "-1234.56" }, { ...base, baseAmount: "0" })).toEqual(["valor"]);
    expect(changedFields({ ...base, date: new Date("2026-11-02T00:00:00Z"), type: "INCOME" }, base)).toEqual([
      "data",
      "tipo",
    ]);
  });
});
