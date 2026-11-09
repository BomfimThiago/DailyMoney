import { describe, it, expect } from "vitest";
import { readWarningLines, summarizeReadErrors } from "@/lib/ingest/read-warnings";

describe("summarizeReadErrors", () => {
  it("agrupa erros iguais com o número da linha no arquivo (cabeçalho é a linha 1)", () => {
    const errors = Array.from({ length: 34 }, (_, i) => ({
      rowIndex: i,
      message: "Não foi possível determinar a moeda da transação",
    }));
    expect(summarizeReadErrors(errors)).toBe(
      "Não foi possível determinar a moeda da transação — linhas 2, 3, 4, 5, 6 e mais 29",
    );
  });

  it("avisos do documento vêm primeiro, como vieram; um problema por linha", () => {
    const msg = summarizeReadErrors([
      {
        rowIndex: -1,
        message: "1 linha(s) de saldo lidas pela IA não são transações e foram ignoradas: «Saldo do dia»",
      },
      { rowIndex: 4, message: "Data inválida" },
      { rowIndex: 9, message: "Data inválida" },
      { rowIndex: 7, message: "Valor inválido" },
    ])!;
    expect(msg.split("\n")).toEqual([
      "1 linha(s) de saldo lidas pela IA não são transações e foram ignoradas: «Saldo do dia»",
      "Data inválida — linhas 6 e 11",
      "Valor inválido — linha 9",
    ]);
  });

  it("OFX conta transações a partir de 1", () => {
    expect(
      summarizeReadErrors([{ rowIndex: 0, message: "Valor OFX inválido: abc" }], {
        label: "transação",
        plural: "transações",
        offset: 1,
      }),
    ).toBe("Valor OFX inválido: abc — transação 1");
  });

  it("sem erros: nada", () => expect(summarizeReadErrors([])).toBeNull());
});

describe("readWarningLines", () => {
  it("lê o formato novo (uma por linha) e o antigo (separado por '; ')", () => {
    expect(readWarningLines("a\nb")).toEqual(["a", "b"]);
    expect(readWarningLines("2 linha(s) não puderam ser lidas: x; y")).toEqual([
      "2 linha(s) não puderam ser lidas: x",
      "y",
    ]);
    expect(readWarningLines(null)).toEqual([]);
  });
});
