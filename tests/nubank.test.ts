import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTabular } from "@/lib/tabular/pipeline";
import { knownLayout } from "@/lib/tabular/known-layouts";
import { parseOfx, isOfx } from "@/lib/ingest/ofx";
import { classifyFile } from "@/lib/ingest/extract-tabular";
import { dedupeHash } from "@/lib/ingest/dedupe";
import { Decimal } from "@/lib/money";

describe("CSV de banco conhecido pelo cabeçalho", () => {
  it("Nubank: sem coluna de moeda → BRL; banco reconhecido", () => {
    const csv =
      "Data,Valor,Identificador,Descrição\n01/10/2026,0.10,aaa-1,Crédito em conta\n08/10/2026,-29.21,aaa-2,Pagamento de boleto efetuado - LOJA\n";
    const r = parseTabular(csv);
    expect(r.bank).toBe("Nubank");
    expect(r.applied.errors).toEqual([]);
    expect(r.applied.rows.map((x) => [x.date.toISOString().slice(0, 10), x.baseAmount, x.baseCurrency])).toEqual([
      ["2026-10-01", "0.1000", "BRL"],
      ["2026-10-08", "-29.2100", "BRL"],
    ]);
  });

  it("cabeçalho genérico não inventa banco", () => {
    expect(knownLayout(["Fecha", "Concepto", "Importe", "Saldo"])).toBeNull();
    expect(knownLayout(["﻿Data", " Valor", "Identificador", "Descrição"])?.bank).toBe("Nubank");
  });
});

describe("OFX", () => {
  // OFX 1.x (SGML): tags de valor sem fechamento; vírgula decimal (alguns bancos BR)
  const SGML = [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "<OFX>",
    "<SIGNONMSGSRSV1><SONRS><FI><ORG>NU PAGAMENTOS S.A.</FI></SONRS></SIGNONMSGSRSV1>",
    "<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL",
    "<BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261008000000[-3:BRT]<TRNAMT>-29,21<FITID>id-1<MEMO>Pagamento de boleto efetuado - LOJA",
    "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261009<TRNAMT>0.62<FITID>id-2<NAME>Crédito em conta",
    "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\n");

  it("lê data, valor, descrição, moeda e banco; o FITID identifica a linha", () => {
    expect(classifyFile("extrato.ofx", "")).toBe("ofx");
    expect(isOfx(SGML)).toBe(true);
    const st = parseOfx(SGML);
    expect(st.errors).toEqual([]);
    expect(st.bank).toBe("Nubank");
    expect(
      st.rows.map((r) => [
        r.date.toISOString().slice(0, 10),
        r.baseAmount,
        r.baseCurrency,
        r.description,
        r.sourceRowRaw,
      ]),
    ).toEqual([
      ["2026-10-08", "-29.2100", "BRL", "Pagamento de boleto efetuado - LOJA", "OFX FITID id-1"],
      ["2026-10-09", "0.6200", "BRL", "Crédito em conta", "OFX FITID id-2"],
    ]);
  });

  it("transação ilegível vira erro visível; as outras ficam", () => {
    const st = parseOfx(SGML.replace("<TRNAMT>0.62", "<TRNAMT>abc"));
    expect(st.rows).toHaveLength(1);
    expect(st.errors[0].message).toMatch(/Valor OFX inválido/);
  });

  it("data impossível (mês 13, 31/02) é erro, não outro dia", () => {
    for (const bad of ["20261301", "20260231"]) {
      const st = parseOfx(SGML.replace("<DTPOSTED>20261009", `<DTPOSTED>${bad}`));
      expect(st.errors[0]?.message).toMatch(/Data OFX inválida/);
    }
  });

  it("moeda ausente não é adivinhada", () => {
    expect(() => parseOfx(SGML.replace("<CURDEF>BRL", ""))).toThrow(/Moeda do OFX/);
  });
});

// Extratos reais (fora do git): CSV e OFX do mesmo período dão as mesmas transações, com a
// mesma chave — importar os dois não duplica.
const FIX = resolve(__dirname, "../fixtures");
describe.each(["01OUT2026_31OUT2026", "01NOV2026_04NOV2026"])("Nubank %s (fixture real)", (period) => {
  const base = resolve(FIX, `NU_857376284_${period}`);
  it.skipIf(!existsSync(`${base}.csv`) || !existsSync(`${base}.ofx`))(
    "CSV = OFX, com as mesmas chaves de dedupe",
    () => {
      const csv = parseTabular(readFileSync(`${base}.csv`, "utf8"));
      const ofx = parseOfx(readFileSync(`${base}.ofx`, "utf8"));
      expect(csv.applied.errors).toEqual([]);
      expect(ofx.errors).toEqual([]);
      expect(csv.bank).toBe("Nubank");
      expect(ofx.bank).toBe("Nubank");
      const key = (r: { date: Date; baseAmount: string; description: string }) =>
        dedupeHash({ bank: "Nubank", date: r.date, baseAmount: r.baseAmount, description: r.description });
      expect(ofx.rows.map(key)).toEqual(csv.applied.rows.map(key));
      const sum = (rows: { baseAmount: string }[]) =>
        rows.reduce((s, r) => s.plus(r.baseAmount), new Decimal(0)).toFixed(2);
      expect(sum(ofx.rows)).toBe(sum(csv.applied.rows));
      expect(new Set(ofx.rows.map((r) => r.baseCurrency))).toEqual(new Set(["BRL"]));
    },
  );
});
