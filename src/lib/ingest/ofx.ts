import type { Currency } from "@prisma/client";
import { Decimal } from "@/lib/money";
import { classifyTransaction } from "@/lib/ingest/classify";
import { canonicalBank } from "@/lib/ingest/bank";
import type { NormalizedRow } from "@/lib/tabular/types";

// OFX (Open Financial Exchange): o formato de extrato que bancos exportam para programas
// de finanças. Estruturado, lido sem IA. Aceita o OFX 1.x (SGML, tags de valor sem
// fechamento) e o 2.x (XML). Cada transação tem um FITID único, que vira a identidade
// da linha para reimportar sem duplicar.

const CURRENCIES = new Set<Currency>(["BRL", "EUR", "USD"]);

const field = (block: string, tag: string) =>
  block.match(new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";

/** "20261001000000[-3:BRT]" → 2026-10-01 (meia-noite UTC, como as datas lidas de CSV). */
function ofxDate(raw: string): Date {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) throw new Error(`Data OFX inválida: ${raw || "vazia"}`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    throw new Error(`Data OFX inválida: ${raw}`);
  }
  return d;
}

/** OFX usa ponto decimal; alguns bancos brasileiros mandam vírgula. */
function ofxAmount(raw: string): Decimal {
  const s = raw.replace(/\s/g, "");
  if (!/^[-+]?\d+(?:[.,]\d+)?$/.test(s)) throw new Error(`Valor OFX inválido: ${raw || "vazio"}`);
  return new Decimal(s.replace(",", "."));
}

export interface OfxStatement {
  bank: string | null;
  rows: NormalizedRow[];
  errors: { rowIndex: number; message: string; raw: string }[];
}

export function isOfx(text: string): boolean {
  return /<OFX>/i.test(text) && /<STMTTRN>/i.test(text);
}

export function parseOfx(text: string): OfxStatement {
  if (!isOfx(text)) throw new Error("Arquivo OFX sem transações (<STMTTRN>)");
  const cur = field(text, "CURDEF").toUpperCase() as Currency;
  if (!CURRENCIES.has(cur)) throw new Error(`Moeda do OFX não suportada: ${cur || "não informada"}`);
  const bank = canonicalBank(field(text, "ORG"));

  const rows: NormalizedRow[] = [];
  const errors: OfxStatement["errors"] = [];
  const blocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)].map((m) => m[1]);
  blocks.forEach((block, rowIndex) => {
    const raw = block.replace(/\s+/g, " ").trim();
    try {
      const fitid = field(block, "FITID");
      const description = (field(block, "MEMO") || field(block, "NAME")).replace(/\s+/g, " ");
      if (!description) throw new Error("Transação sem descrição (MEMO/NAME)");
      const amount = ofxAmount(field(block, "TRNAMT"));
      const { type, isInternalTransfer } = classifyTransaction(amount);
      rows.push({
        date: ofxDate(field(block, "DTPOSTED")),
        description,
        merchantRaw: description,
        baseCurrency: cur,
        baseAmount: amount.toFixed(4),
        feeAmount: "0.0000",
        type,
        state: "COMPLETED",
        isInternalTransfer,
        // identidade da linha: o FITID (único por transação no banco); sem ele, o bloco todo
        sourceRowRaw: fitid ? `OFX FITID ${fitid}` : raw,
      });
    } catch (err) {
      errors.push({ rowIndex, message: err instanceof Error ? err.message : "Erro ao ler transação OFX", raw });
    }
  });
  return { bank, rows, errors };
}
