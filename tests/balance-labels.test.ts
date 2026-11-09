import { describe, it, expect } from "vitest";
import { isBalanceLabel } from "@/lib/ingest/labels";
import { readLedger } from "@/lib/ingest/pdf-ledger";

describe("isBalanceLabel: linha de saldo não é transação", () => {
  it.each([
    "Saldo do dia",
    "Saldo do dia: -R$ 15,12",
    "19 de Março de 2026 Saldo do dia",
    "Saldo anterior",
    "Saldo final do período",
    "Saldo bloqueado: R$ 0,00",
    "Saldo disponível",
    "Total de saídas",
    "Saldo del día",
    "Closing balance",
  ])("%s → saldo", (d) => expect(isBalanceLabel(d)).toBe(true));

  it.each([
    "Saldo transferido para poupança",
    'Pix enviado: "Cp :00000000-Fulano"',
    "Total Energies",
    "TotalPass academia",
    "Rendimento",
    "Crédito em conta",
    "Interés neto pagado",
  ])("%s → transação de verdade", (d) => expect(isBalanceLabel(d)).toBe(false));
});

describe("readLedger ignora linha de saldo com dois valores no fim", () => {
  it("Inter: 'Saldo do dia' sozinho na linha não vira lançamento", () => {
    const ledger = readLedger([
      [
        "18 de Março de 2026 Saldo do dia: R$ 34,88",
        'Pix enviado: "Cp :00000000-Fulano" -R$ 50,00 -R$ 15,12',
        "19 de Março de 2026",
        "Saldo do dia: -R$ 15,12 -R$ 15,12",
        'Pix recebido: "Cp :11111111-Beltrano" R$ 20,00 R$ 4,88',
      ].join("\n"),
    ]);
    expect(ledger.map((l) => [l.amount.toFixed(2), l.balance.toFixed(2)])).toEqual([
      ["-50.00", "-15.12"],
      ["20.00", "4.88"],
    ]);
  });
});
