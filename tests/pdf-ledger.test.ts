import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findDates, readLedger, reconcileWithLedger, NOT_IN_STATEMENT } from "@/lib/ingest/pdf-ledger";
import { parseTabular } from "@/lib/tabular/pipeline";
import type { NormalizedRow } from "@/lib/tabular/types";

// Leitura de PDF por IA conferida pelo texto do próprio extrato: valor, sinal e saldo
// vêm do texto; a IA só dá data e descrição. Os layouts abaixo reproduzem, com
// dados inventados, como cada banco aparece depois de virar texto (unpdf).

const day = (d: Date) => d.toISOString().slice(0, 10);

// Revolut: valores SEM sinal (colunas "saliente"/"entrante"), ordem crescente,
// descrição às vezes em duas linhas, detalhes depois da linha do valor.
const REVOLUT = [
  "Resumen del saldo",
  "Cuenta (Cuenta Corriente) 100,00€ 300,00€ 160,00€ 240,00€",
  "Fecha de la transacción Fecha valor Descripción Dinero saliente Dinero entrante Saldo",
  "1 ago 2026 2 ago 2026 Mercado Central 10,00€ 90,00€",
  "Tarjeta: 4165******0000",
  "2 ago 2026 2 ago 2026 Transferencia de ANA",
  "SOUZA",
  "200,00€ 290,00€",
  "Referencia: aluguel",
  "3 ago 2026 3 ago 2026 Transferencia a ANA SOUZA 50,00€ 240,00€",
  "3 ago 2026 4 ago 2026 Padaria 50,00€ 190,00€",
  "5 ago 2026 5 ago 2026 Transferencia de ANA SOUZA 50,00€ 240,00€",
].join("\n");

// CaixaBank: sinal impresso, ordem decrescente, data no meio da linha.
const CAIXA = [
  "Concepto Fecha Importe Saldo",
  "TGSS.COTIZACION 0 31/07/2026 -88,56€ 253,74€",
  "TRANSFER INMEDIATA 30/07/2026 40,00€ 342,30€",
  "COSTCO WHOLESALE 30/07/2026 -490,25€ 302,30€",
  "TRANSFER INMEDIATA 30/07/2026 700,00€ 792,55€",
  "MERKA EXPRESS 2 27/07/2026 -3,60€ 92,55€",
  "Klarna*Leonisa 27/07/2026 -29,67€ 96,15€",
].join("\n");

describe("findDates", () => {
  it("lê os formatos de data dos extratos (es, pt, numérico, ISO)", () => {
    expect(findDates("3 jul 2026 4 jul 2026 Cinesa").map(day)).toEqual(["2026-07-03", "2026-07-04"]);
    expect(findDates("10 de abril de 2026 | Transação: TRANSFER-1").map(day)).toEqual(["2026-04-10"]);
    expect(findDates("4 de Agosto de 2025 Saldo do dia: R$ 19.154,71").map(day)).toEqual(["2025-08-04"]);
    expect(findDates("2 de março de 2026").map(day)).toEqual(["2026-03-02"]);
    expect(findDates("TGSS 31/07/2026 -88,56€").map(day)).toEqual(["2026-07-31"]);
    expect(findDates("2026-07-31")).toHaveLength(1);
    expect(findDates("31/02/2026")).toHaveLength(0); // data impossível não vira 3 de março
  });
});

describe("readLedger", () => {
  it("Revolut (sem sinal): o sinal sai da diferença de saldo entre linhas vizinhas", () => {
    const l = readLedger([REVOLUT]);
    const tx = l.filter((x) => x.chained);
    expect(tx.map((x) => x.amount.toFixed(2))).toEqual(["-10.00", "200.00", "-50.00", "-50.00", "50.00"]);
    expect(tx.every((x) => x.signKnown)).toBe(true);
    // Descrição em duas linhas, sem os detalhes da transação anterior.
    expect(tx[1].description).toBe("Transferencia de ANA SOUZA");
    expect(day(tx[1].dates.before!)).toBe("2026-08-02");
  });

  it("primeira linha: o sinal sai do saldo inicial impresso no resumo", () => {
    const first = readLedger([REVOLUT]).find((x) => x.balance.eq(90));
    expect(first?.amount.toFixed(2)).toBe("-10.00"); // 90 + 10 = 100,00 (saldo inicial)
  });

  it("linha de resumo não encadeia (não vira transação)", () => {
    const summary = readLedger([REVOLUT]).find((x) => x.text.includes("Cuenta Corriente"));
    expect(summary?.chained).toBe(false);
  });

  it("CaixaBank (com sinal): o sinal impresso vale, em ordem decrescente", () => {
    const l = readLedger([CAIXA]);
    expect(l.map((x) => x.amount.toFixed(2))).toEqual(["-88.56", "40.00", "-490.25", "700.00", "-3.60", "-29.67"]);
    expect(l[0].description).toBe("TGSS.COTIZACION 0");
    expect(day(l[0].dates.line!)).toBe("2026-07-31");
    expect(l[0].currency).toBe("EUR");
  });
});

function aiRow(date: string, description: string, amount: string, balance: string | null = null): NormalizedRow {
  return {
    date: new Date(`${date}T00:00:00Z`),
    description,
    merchantRaw: description,
    baseCurrency: "EUR",
    baseAmount: amount,
    feeAmount: "0.0000",
    balance,
    type: "EXPENSE",
    state: "COMPLETED",
    isInternalTransfer: false,
    sourceRowRaw: "{}",
  };
}

describe("reconcileWithLedger", () => {
  it("reimportar o mesmo PDF reconhece cada linha pelo texto do extrato, não pela descrição da IA", async () => {
    const { sourceKeys } = await import("@/lib/ingest/identity");
    const read = (descriptions: string[]) => {
      const ai = [
        aiRow("2026-08-01", descriptions[0], "-10"),
        aiRow("2026-08-02", descriptions[1], "200"),
        aiRow("2026-08-03", descriptions[2], "-50"),
        aiRow("2026-08-03", descriptions[3], "-50"),
        aiRow("2026-08-05", descriptions[4], "50"),
      ];
      const plan = reconcileWithLedger(ai, readLedger([REVOLUT]))!;
      return sourceKeys(plan.rows, false);
    };
    // a IA escreve a descrição um pouco diferente a cada leitura
    const first = read([
      "Mercado Central",
      "Transferencia de ANA SOUZA",
      "Transferencia a ANA SOUZA",
      "Padaria",
      "Transferencia de ANA SOUZA",
    ]);
    const second = read([
      "MERCADO CENTRAL",
      "Transferencia de ANA",
      "Transf. a ANA SOUZA",
      "Padaria SL",
      "Transferencia de ANA SOUZA",
    ]);
    expect(first.every(Boolean)).toBe(true);
    expect(new Set(first).size).toBe(5);
    expect(second).toEqual(first);
  });

  it("a moeda vem da linha do extrato, não da moeda que a IA leu na descrição", () => {
    const ai = [
      aiRow("2026-08-01", "Mercado Central", "-10"),
      { ...aiRow("2026-08-02", "Transferencia de ANA SOUZA", "200"), baseCurrency: "BRL" as const }, // "convertidos para … BRL"
      aiRow("2026-08-03", "Transferencia a ANA SOUZA", "-50"),
      aiRow("2026-08-03", "Padaria", "-50"),
      aiRow("2026-08-05", "Transferencia de ANA SOUZA", "50"),
    ];
    const plan = reconcileWithLedger(ai, readLedger([REVOLUT]))!;
    expect(new Set(plan.rows.map((r) => r.baseCurrency))).toEqual(new Set(["EUR"]));
  });

  it("corrige o sinal, a data e descarta o que a IA inventou; recupera o que ela pulou", () => {
    const ledger = readLedger([REVOLUT]);
    const ai = [
      aiRow("2026-08-01", "Mercado Central", "-10"),
      aiRow("2026-08-02", "Transferencia de ANA SOUZA", "-200"), // sinal trocado
      aiRow("2026-08-03", "Transferencia a ANA SOUZA", "-50"),
      aiRow("2026-08-03", "Padaria", "-50"),
      aiRow("2026-08-05", "Transferencia de ANA SOUZA", "-50"), // sinal trocado
      aiRow("2026-08-20", "Notificar la tarjeta como perdida", "-34"), // inventada
    ];
    const plan = reconcileWithLedger(ai, ledger)!;
    expect(plan.dropped.map((r) => r.description)).toEqual(["Notificar la tarjeta como perdida"]);
    expect(plan.unmatched).toHaveLength(0);
    expect(plan.rows.map((r) => r.baseAmount)).toEqual(["-10.0000", "200.0000", "-50.0000", "-50.0000", "50.0000"]);
    expect(plan.rows.map((r) => r.balance)).toEqual(["90.00", "290.00", "240.00", "190.00", "240.00"]);
  });

  it("linha pulada pela IA sai do texto (data no lugar calibrado + descrição)", () => {
    const ledger = readLedger([CAIXA]);
    const ai = [
      aiRow("2026-07-01", "TGSS.COTIZACION 0", "-88.56"), // dia/mês trocados pela IA
      aiRow("2026-07-30", "TRANSFER INMEDIATA", "40"),
      aiRow("2026-07-30", "COSTCO WHOLESALE", "-490.25"),
      aiRow("2026-07-30", "TRANSFER INMEDIATA", "700"),
      aiRow("2026-07-27", "Klarna*Leonisa", "-29.67"),
      // MERKA EXPRESS 2 (-3,60) ficou de fora
    ];
    const plan = reconcileWithLedger(ai, ledger)!;
    expect(plan.rows).toHaveLength(6);
    expect(day(plan.rows[0].date)).toBe("2026-07-31"); // a data do texto corrigiu a da IA
    const merka = plan.rows.find((r) => r.baseAmount === "-3.6000");
    expect(merka?.description).toBe("MERKA EXPRESS 2");
    expect(day(merka!.date)).toBe("2026-07-27");
    expect(plan.unmatched).toHaveLength(0);
  });

  it("sem saldo corrido no documento não há o que conferir", () => {
    expect(reconcileWithLedger([aiRow("2026-07-01", "x", "-1")], readLedger(["Recibo\nTotal 10,00€"]))).toBeNull();
  });

  it("razão incompleto: as linhas da IA ficam, e as que não aparecem vão para revisão", () => {
    const ledger = readLedger([
      "A 1/7/2026 -1,00€ 9,00€\nB 2/7/2026 -1,00€ 8,00€\nC 3/7/2026 -1,00€ 7,00€\nResumo 50,00€ 60,00€\nOutro 70,00€ 80,00€",
    ]);
    const ai = [aiRow("2026-07-01", "A", "-1"), aiRow("2026-07-04", "Sem saldo no extrato", "-5")];
    const plan = reconcileWithLedger(ai, ledger)!;
    expect(plan.rows.find((r) => r.description === "Sem saldo no extrato")?.reviewReason).toBe(NOT_IN_STATEMENT);
  });
});

// Extratos reais (fora do git, em fixtures/): o razão do PDF tem que bater com o CSV
// do mesmo período, que é lido sem IA.
const FIX = resolve(__dirname, "../fixtures");
const REAL = [
  ["extractDocument_20260820.pdf", "extractDocument_20260820.csv"],
  [
    "account-statement_2026-07-01_2026-07-31_es-es_7c8d2d.pdf",
    "account-statement_2026-07-01_2026-07-31_es-es_0bd117.csv",
  ],
] as const;

describe.each(REAL)("extrato real %s", (pdf, csv) => {
  it.skipIf(!existsSync(resolve(FIX, pdf)))("valores e sinais do PDF = CSV", async () => {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(readFileSync(resolve(FIX, pdf))));
    const { text } = await extractText(doc, { mergePages: false });
    const ledger = readLedger(Array.isArray(text) ? text : [text]).filter((l) => l.chained);
    const truth = parseTabular(readFileSync(resolve(FIX, csv), "utf8"))
      .applied.rows.map((r) => Number(r.baseAmount).toFixed(2))
      .sort();
    expect(ledger.map((l) => l.amount.toFixed(2)).sort()).toEqual(truth);
  });
});

describe("checkBalances (sem razão no texto: saldo lido pela IA)", () => {
  it("inverte o sinal quando só o sinal oposto fecha o saldo; marca o resto", async () => {
    const { checkBalances } = await import("@/lib/tabular/balance");
    const rows = [
      aiRow("2026-08-01", "a", "-10.0000", "90.00"),
      aiRow("2026-08-02", "b", "-200.0000", "290.00"), // entrada lida como saída
      aiRow("2026-08-03", "c", "-50.0000", "240.00"),
      aiRow("2026-08-04", "d", "-7.0000", "999.00"), // saldo não fecha de jeito nenhum
    ];
    const { flipped, flagged } = checkBalances(rows, { fixSigns: true });
    expect(flipped.map((r) => r.description)).toEqual(["b"]);
    expect(rows[1].baseAmount).toBe("200.0000");
    expect(flagged.map((r) => r.description)).toEqual(["d"]);
    // Sem fixSigns (CSV), o sinal do arquivo nunca muda: só marca.
    const csv = [
      aiRow("2026-08-01", "a", "-10", "90"),
      aiRow("2026-08-02", "b", "-200", "290"),
      aiRow("2026-08-03", "c", "-50", "240"),
    ];
    expect(checkBalances(csv).flagged.map((r) => r.description)).toEqual(["b"]);
    expect(csv[1].baseAmount).toBe("-200");
  });

  it("duas contas no mesmo arquivo: o começo de cada série não é erro; um buraco é", async () => {
    const { checkBalances } = await import("@/lib/tabular/balance");
    const twoAccounts = () => [
      // conta corrente: o mais antigo pela data NÃO é o começo da série (data de início ≠ ordem do saldo)
      aiRow("2026-07-31", "corrente 2", "-20", "60"),
      aiRow("2026-08-01", "corrente 1", "-20", "80"), // começo: saldo anterior 100 não está no arquivo
      aiRow("2026-08-04", "corrente 3", "-10", "50"),
      aiRow("2026-08-06", "corrente 4", "-5", "45"),
      // poupança aberta no meio do mês, correndo em paralelo
      aiRow("2026-08-03", "poupança 1", "500", "500"),
      aiRow("2026-08-05", "poupança 2", "0.01", "500.01"),
    ];
    expect(checkBalances(twoAccounts()).flagged).toEqual([]);
    // valor lido errado no meio da corrente: a série se parte e a 2ª metade começa
    // depois que a 1ª terminou → é buraco, não conta nova (mesmo com a poupança em
    // paralelo). A poupança também começou depois e pode ir junto para revisão: na
    // dúvida, revisar a mais.
    const broken = twoAccounts();
    broken[2].baseAmount = "-9";
    expect(checkBalances(broken).flagged.map((r) => r.description)).toContain("corrente 3");
    expect(checkBalances(broken).flagged.map((r) => r.description)).not.toContain("corrente 1");
  });
});

describe("parseJsonLoose", () => {
  it("fica com os itens completos quando o modelo quebra o JSON no meio", async () => {
    process.env.DATABASE_URL ||= "postgresql://x:x@localhost:5432/x";
    process.env.JWT_SECRET ||= "0123456789abcdef0123";
    const { parseJsonLoose } = await import("@/lib/ai/extract");
    const broken =
      '{"bank":"Wise","transactions":[{"date":"2026-08-05","amount":"-1"},{"date":"2026-08-06","amount":"-2"} {"date":"2026-08-07","amo';
    expect(parseJsonLoose(broken)).toEqual({
      bank: "Wise",
      transactions: [
        { date: "2026-08-05", amount: "-1" },
        { date: "2026-08-06", amount: "-2" },
      ],
    });
    expect(() => parseJsonLoose("sem json")).toThrow();
  });
});
