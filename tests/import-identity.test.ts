import { describe, it, expect } from "vitest";
import { dedupeHash, occurrenceHashes } from "@/lib/ingest/dedupe";
import { canonicalBank } from "@/lib/ingest/bank";

describe("occurrenceHashes", () => {
  it("duas transações iguais no mesmo dia (PDF sem horário) não viram uma só", () => {
    const h = dedupeHash({
      bank: "Revolut",
      date: new Date("2026-07-10T00:00:00Z"),
      baseAmount: "-100",
      description: "Transferencia a ANA",
    });
    const other = dedupeHash({
      bank: "Revolut",
      date: new Date("2026-07-11T00:00:00Z"),
      baseAmount: "-5",
      description: "Padaria",
    });
    const out = occurrenceHashes([h, other, h, h]);
    expect(new Set(out).size).toBe(4);
    // a 1ª ocorrência mantém a chave de sempre (compatível com o que já está gravado)
    expect(out[0]).toBe(h);
    expect(out[1]).toBe(other);
    // um extrato sobreposto com as mesmas repetições gera as mesmas chaves
    expect(occurrenceHashes([h, h, h])).toEqual([out[0], out[2], out[3]]);
  });
});

describe("canonicalBank", () => {
  it("nome curto e estável; 'null' da IA vira vazio", () => {
    expect(canonicalBank("Revolut Bank UAB Sucursal En España")).toBe("Revolut");
    expect(canonicalBank("Wise Europe SA")).toBe("Wise");
    expect(canonicalBank("BANCO INTER S.A.")).toBe("Banco Inter");
    expect(canonicalBank("null")).toBeNull();
    expect(canonicalBank("  ")).toBeNull();
    expect(canonicalBank("Banco Pequeno do Interior")).toBe("Banco Pequeno do Interior");
  });
});
