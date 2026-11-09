import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTabular } from "@/lib/tabular/pipeline";
import { Decimal } from "@/lib/money";

// Wise (Statements → CSV): cabeçalho exato do export de nov/2026, uma moeda por arquivo.
const HEADER =
  '"TransferWise ID",Date,"Date Time",Amount,Currency,Description,"Payment Reference","Running Balance","Exchange From","Exchange To","Exchange Rate","Payer Name","Payee Name","Payee Account Number",Merchant,"Card Last Four Digits","Card Holder Full Name",Attachment,Note,"Total fees","Exchange To Amount","Transaction Type","Transaction Details Type"';

const csv = (...rows: string[]) => [HEADER, ...rows, ""].join("\n");

describe("Wise CSV", () => {
  const usd = csv(
    'BALANCE-1,02-11-2026,"02-11-2026 16:01:01.163",-5257.14,USD,"Converted 5,257.14 USD to 28,332.56 BRL",,0.00,USD,BRL,5.43785,,,,,,,,,46.89,28332.56,DEBIT,CONVERSION',
    'TRANSFER-2,02-11-2026,"02-11-2026 14:41:13.922",5257.14,USD,"Received money from ACME INC. with reference 123",123,5257.14,,,,"ACME INC.",,,,,,,,0.00,,CREDIT,DEPOSIT',
    'CARD-3,01-11-2026,"01-11-2026 09:00:00.000",-12.30,USD,"Card transaction of 12.30 USD issued by Cafe",,0.00,,,,,,,Cafe,1234,,,,0.00,,DEBIT,CARD',
  );

  it("reconhece o banco pelo cabeçalho, sem IA; moeda pela coluna Currency", () => {
    const r = parseTabular(usd);
    expect(r.bank).toBe("Wise");
    expect(r.applied.errors).toEqual([]);
    expect(r.applied.rows.map((x) => [x.date.toISOString().slice(0, 10), x.baseAmount, x.baseCurrency])).toEqual([
      ["2026-11-02", "-5257.1400", "USD"],
      ["2026-11-02", "5257.1400", "USD"],
      ["2026-11-01", "-12.3000", "USD"],
    ]);
  });

  it("câmbio entre as moedas da conta (CONVERSION) é movimentação; salário e compra, não", () => {
    const r = parseTabular(usd);
    expect(r.applied.rows.map((x) => x.isInternalTransfer)).toEqual([true, false, false]);
  });

  it("o valor já vem com a tarifa descontada: o saldo corrido fecha sem tirar a tarifa de novo", () => {
    const [conv] = parseTabular(usd).applied.rows;
    expect(conv.feeAmount).toBe("46.8900");
    // saldo antes (5257,14) + valor = saldo depois (0,00)
    expect(new Decimal("5257.14").plus(conv.baseAmount).toFixed(2)).toBe(conv.balance);
  });

  it("período sem movimento (só o cabeçalho): diz que não há transações", () => {
    expect(() => parseTabular(csv())).toThrow(/não tem nenhuma transação/);
  });

  it("cabeçalho parecido mas não igual não vira Wise", () => {
    expect(parseTabular(usd.replace('"Transaction Details Type"', "Kind")).bank).toBeNull();
  });
});

const FIX = resolve(__dirname, "../fixtures");
const files = [
  ["statement_143459241_BRL_2026-10-01_2026-11-07.csv", "BRL", 8],
  ["statement_143459274_USD_2026-10-01_2026-11-07.csv", "USD", 2],
] as const;

describe.skipIf(!files.every(([f]) => existsSync(resolve(FIX, f))))("Wise CSV (fixture real)", () => {
  it.each(files)("%s: todas as linhas, na moeda do arquivo, saldo corrido fechando", (file, currency, count) => {
    const r = parseTabular(readFileSync(resolve(FIX, file), "utf8"));
    expect(r.bank).toBe("Wise");
    expect(r.applied.errors).toEqual([]);
    expect(r.applied.rows).toHaveLength(count);
    for (const row of r.applied.rows) expect(row.baseCurrency).toBe(currency);
    // do mais antigo para o mais novo, cada saldo = anterior + valor
    const rows = [...r.applied.rows].reverse();
    for (let i = 1; i < rows.length; i++) {
      expect(new Decimal(rows[i - 1].balance!).plus(rows[i].baseAmount).toFixed(2)).toBe(rows[i].balance);
    }
    // o câmbio USD→BRL aparece nos dois arquivos, como movimentação nos dois
    const conv = r.applied.rows.filter((x) => x.description.startsWith("Converted "));
    expect(conv).toHaveLength(1);
    expect(conv[0].isInternalTransfer).toBe(true);
  });

  it.each(["statement_143459558_EUR_2026-10-01_2026-11-07.csv", "statement_35468615_USD_2026-10-01_2026-11-07.csv"])(
    "%s (sem movimento no período): mensagem clara",
    (file) => {
      expect(() => parseTabular(readFileSync(resolve(FIX, file), "utf8"))).toThrow(/não tem nenhuma transação/);
    },
  );
});

describe("PDF que é só imagem", () => {
  const caixa = resolve(FIX, "CaixaBank_digital_CaixaBankNow_2026117.pdf");
  const withText = ["statement_143459241_BRL_2025-12-16_2026-08-19.pdf", "NU_857376284_01OUT2026_31OUT2026.pdf"]
    .map((f) => resolve(FIX, f))
    .filter(existsSync);

  it.skipIf(!existsSync(caixa))(
    'CaixaBankNow "digital" (3 páginas de imagem): reconhecido, nenhum número lido',
    async () => {
      const { isImageOnlyPdf, pdfLines } = await import("@/lib/ingest/pdf-sections");
      expect(isImageOnlyPdf(await pdfLines(readFileSync(caixa)))).toBe(true);
    },
  );

  it.skipIf(!withText.length)("PDFs com texto (Wise, Nubank) seguem o caminho normal", async () => {
    const { isImageOnlyPdf, pdfLines } = await import("@/lib/ingest/pdf-sections");
    for (const f of withText) expect(isImageOnlyPdf(await pdfLines(readFileSync(f)))).toBe(false);
  });
});
