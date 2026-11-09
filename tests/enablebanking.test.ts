import { describe, it, expect } from "vitest";
import { ebAccountKey, ebAccountLabel, mapEbTransactions } from "@/lib/enablebanking/map";
import { EbTransaction, SessionResponse, TransactionsPage } from "@/lib/enablebanking/schemas";
import { describeOther } from "@/lib/ingest/cross-source";

// Formato da referência da API (https://enablebanking.com/docs/api/reference/). Quando
// houver uma conta real vinculada, trocar por uma fixture real (fixtures/, fora do git).

const FROM_ALL = new Date(Date.UTC(2000, 0, 1));
const eur = { currency: "EUR" };
const tx = (over: Partial<EbTransaction>): EbTransaction => ({
  entry_reference: "5561990681",
  transaction_amount: { currency: "EUR", amount: "12.30" },
  credit_debit_indicator: "DBIT",
  status: "BOOK",
  booking_date: "2026-10-08",
  creditor: { name: "MERCADONA S.A." },
  remittance_information: ["Compra tarjeta 1234 MERCADONA VALENCIA"],
  ...over,
});

describe("Enable Banking → linhas da importação", () => {
  it("sinal pelo indicador: DBIT sai (negativo), CRDT entra; valor de texto vira Decimal", () => {
    const m = mapEbTransactions(
      eur,
      [
        tx({}),
        tx({
          entry_reference: "r2",
          credit_debit_indicator: "CRDT",
          transaction_amount: { currency: "EUR", amount: "2500.00" },
          debtor: { name: "ACME SL" },
          creditor: null,
          remittance_information: ["Nómina octubre"],
        }),
        // alguns bancos mandam o valor já com sinal: o indicador manda
        tx({ entry_reference: "r3", transaction_amount: { currency: "EUR", amount: "-0.10" } }),
      ],
      { from: FROM_ALL },
    );
    expect(m.errors).toEqual([]);
    expect(m.rows.map((r) => [r.baseAmount, r.baseCurrency, r.type, r.sourceRowRaw])).toEqual([
      ["-12.3000", "EUR", "EXPENSE", "ENABLEBANKING 5561990681"],
      ["2500.0000", "EUR", "INCOME", "ENABLEBANKING r2"],
      ["-0.1000", "EUR", "EXPENSE", "ENABLEBANKING r3"],
    ]);
  });

  it("descrição: contraparte e texto da transferência, sem repetir; nome vira o comerciante", () => {
    const m = mapEbTransactions(
      eur,
      [
        tx({ remittance_information: ["Bizum a Laura", "Cena"], creditor: { name: "Laura" } }),
        tx({ entry_reference: "r2", remittance_information: ["Recibo"], creditor: { name: "IBERDROLA" } }),
        tx({ entry_reference: "r3", remittance_information: null, creditor: null, note: "Comisión mantenimiento" }),
      ],
      { from: FROM_ALL },
    );
    expect(m.rows.map((r) => [r.description, r.merchantRaw])).toEqual([
      ["Bizum a Laura Cena", "Laura"],
      ["IBERDROLA · Recibo", "IBERDROLA"],
      ["Comisión mantenimiento", "Comisión mantenimiento"],
    ]);
  });

  it("só entram as lançadas: pendente fica para a próxima sincronização", () => {
    const m = mapEbTransactions(
      eur,
      [tx({ status: "PDNG", entry_reference: "p" }), tx({ status: "HOLD", entry_reference: "h" }), tx({})],
      {
        from: FROM_ALL,
      },
    );
    expect(m.rows).toHaveLength(1);
    expect(m.errors).toEqual([]);
  });

  it("data: lançamento, ou valor/operação na falta; antes do início fica de fora mas marca a janela", () => {
    const m = mapEbTransactions(
      eur,
      [
        tx({ booking_date: null, value_date: "2026-10-09" }),
        tx({ entry_reference: "old", booking_date: "2026-09-01" }),
      ],
      { from: new Date(Date.UTC(2026, 9, 1)) },
    );
    expect(m.rows.map((r) => r.date.toISOString().slice(0, 10))).toEqual(["2026-10-09"]);
    expect(m.earliest?.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("sem referência do banco: impressão digital estável de dia, direção, valor e descrição", () => {
    const a = mapEbTransactions(eur, [tx({ entry_reference: null })], { from: FROM_ALL });
    const b = mapEbTransactions(eur, [tx({ entry_reference: null, transaction_id: "muda-a-cada-leitura" })], {
      from: FROM_ALL,
    });
    expect(a.rows[0].sourceRowRaw).toBe(b.rows[0].sourceRowRaw);
    expect(a.rows[0].sourceRowRaw).toContain("2026-10-08|DBIT|12.30|EUR|");
  });

  it("problemas viram erro visível da linha, nunca valor inventado", () => {
    const m = mapEbTransactions(
      eur,
      [
        tx({ entry_reference: "a", transaction_amount: { currency: "EUR", amount: "12,30" } }),
        tx({ entry_reference: "b", transaction_amount: { currency: "GBP", amount: "5.00" } }),
        tx({ entry_reference: "c", booking_date: "08/10/2026" }),
        tx({ entry_reference: "d", creditor: null, remittance_information: [] }),
      ],
      { from: FROM_ALL },
    );
    expect(m.rows).toHaveLength(0);
    expect(m.errors.map((e) => e.message)).toEqual([
      "Valor inválido: 12,30",
      "Moeda não suportada: GBP",
      "Data inválida: 08/10/2026",
      "Transação sem descrição",
    ]);
  });

  it("contas: identidade fixa entre sessões (hash da API, ou do IBAN) e nome pelo tipo", () => {
    const base = { uid: "u1", currency: "EUR" };
    expect(ebAccountKey({ ...base, identification_hash: "h1" })).toBe("h1");
    expect(ebAccountKey({ ...base, account_id: { iban: "ES91 2100 0418 4502 0005 1332" } })).toBe(
      ebAccountKey({ ...base, uid: "outro", account_id: { iban: "es9121000418450200051332" } }),
    );
    expect(ebAccountLabel({ cash_account_type: "CACC" })).toBe("Conta corrente");
    expect(ebAccountLabel({ cash_account_type: "CARD" })).toBe("Cartão");
    expect(ebAccountLabel({ cash_account_type: "OTHR", name: "Hucha" })).toBe("Hucha");
  });

  it("respostas da API: aceita o formato da referência e recusa valor numérico", () => {
    expect(
      SessionResponse.safeParse({
        session_id: "s",
        accounts: [
          {
            uid: "u",
            identification_hash: "h",
            account_id: { iban: "FI8821291587733851" },
            currency: "EUR",
            cash_account_type: "CACC",
          },
        ],
        aspsp: { name: "Nordea", country: "FI" },
        access: { valid_until: "2027-05-05T00:00:00+00:00" },
        psu_type: "personal",
      }).success,
    ).toBe(true);
    expect(TransactionsPage.safeParse({ transactions: [tx({})], continuation_key: null }).success).toBe(true);
    expect(EbTransaction.safeParse({ ...tx({}), transaction_amount: { currency: "EUR", amount: 12.3 } }).success).toBe(
      false,
    );
  });

  it("na revisão, a transação já gravada pela Enable Banking aparece como do banco conectado", () => {
    expect(
      describeOther({
        description: "IBERDROLA · Recibo luz",
        upload: { filename: "x", detectedFormat: "enablebanking" },
      }),
    ).toBe("“IBERDROLA · Recibo luz”, do banco conectado");
  });
});
