import { Decimal } from "@/lib/money";
import type { Currency } from "@prisma/client";
import type { NormalizedRow } from "@/lib/tabular/types";
import { MONEY, findDates, mostCited, parseMoney } from "@/lib/ingest/pdf-ledger";

// Extrato "por seções" lido só do texto do PDF, sem IA (ex.: Nubank). Não há saldo em
// cada linha; os lançamentos vêm agrupados por dia em seções com o total impresso:
//
//   02 OUT 2026   Total de entradas            + 500,00
//                 Transferência recebida pelo Pix FULANO - …       500,00
//                                 BANCO X (0104) Agência: 400
//                 Total de saídas                - 500,00
//                 Transferência enviada pelo Pix …                 500,00
//
// O sinal vem da seção; a data, do cabeçalho do dia; o valor, do fim da 1ª linha de cada
// lançamento (a descrição continua nas linhas recuadas abaixo, até numa página seguinte).
// Conferências: a soma de cada seção tem que dar o total impresso, e saldo inicial +
// lançamentos tem que dar o saldo final do resumo. O que não fecha vai para revisão.
//
// A ordem do texto "puro" do PDF segue a ordem de desenho, não a da página (o valor às
// vezes sai depois da descrição inteira), por isso a leitura usa a posição (x, y) de cada
// pedaço de texto para remontar as linhas como aparecem.

export interface PositionedLine {
  y: number;
  items: { x: number; s: string }[];
}

export interface Section {
  date: Date;
  sign: 1 | -1;
  total: Decimal;
  sum: Decimal;
  ok: boolean;
}

export interface SectionedStatement {
  rows: NormalizedRow[];
  sections: Section[];
  bank: string | null;
  /** Saldo inicial + lançamentos = saldo final (null: o resumo não foi achado). */
  balanced: boolean | null;
  warnings: string[];
}

export const SECTION_MISMATCH = "a soma do dia não bate com o total do extrato";

const SECTION = /\bTotal\s+(?:de\s+)?(entradas|cr[ée]ditos|sa[íi]das|d[ée]bitos)\b/i;
// Valor de um lançamento: sem sinal (o sinal é o da seção), no fim da linha.
const AMOUNT_AT_END = /(?:^|\s)((?:R\$\s?)?\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*$/;
const SIGNED_AT_END = new RegExp(String.raw`([-−+])\s*(${MONEY})\s*$`);
const lineText = (l: PositionedLine) =>
  l.items
    .map((i) => i.s.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
const minX = (l: PositionedLine) => Math.min(...l.items.map((i) => i.x));
const shape = (s: string) => s.replace(/\d/g, "#");

/** Remonta as linhas de cada página pela posição do texto (y de cima para baixo, x da esquerda). */
/**
 * PDF que é só imagem: o app do banco "imprimiu" a tela (CaixaBankNow digital) ou é uma
 * digitalização. O texto que sobra é o número da página ("1/3"); não há valor nem data
 * para ler. Daqui não sai número nenhum: nem a IA lê valores de imagem (as regras do app).
 */
export function isImageOnlyPdf(pages: PositionedLine[][]): boolean {
  const text = pages.flatMap((p) => p.flatMap((l) => l.items.map((i) => i.s))).join("");
  return text.replace(/\s/g, "").length < 20 * Math.max(1, pages.length);
}

export const IMAGE_PDF_MESSAGE =
  "Este PDF é uma imagem (não tem texto), e o app não lê valores de imagem. Baixe o extrato do banco em CSV, Excel ou num PDF com texto e importe esse arquivo. No CaixaBankNow, use a exportação dos movimentos em vez da versão “digital”.";

export async function pdfLines(bytes: Buffer | Uint8Array): Promise<PositionedLine[][]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pages: PositionedLine[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lines: PositionedLine[] = [];
    for (const it of content.items as { str?: string; transform?: number[] }[]) {
      if (!it.str?.trim() || !it.transform) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      const line = lines.find((l) => Math.abs(l.y - y) <= 2);
      if (line) line.items.push({ x, s: it.str });
      else lines.push({ y, items: [{ x, s: it.str }] });
    }
    for (const l of lines) l.items.sort((a, b) => a.x - b.x);
    pages.push(lines.sort((a, b) => b.y - a.y));
  }
  return pages;
}

/** Linhas repetidas no topo e no rodapé de todas as páginas (nome, conta, atendimento…). */
function stripBoilerplate(pages: PositionedLine[][]): { body: PositionedLine[][]; boilerplate: string[] } {
  if (pages.length < 2) return { body: pages, boilerplate: [] };
  const texts = pages.map((p) => p.map((l) => shape(lineText(l))));
  let head = 0;
  while (texts.every((t) => head < t.length && t[head] === texts[0][head])) head++;
  let tail = 0;
  while (texts.every((t) => tail < t.length - head && t[t.length - 1 - tail] === texts[0][texts[0].length - 1 - tail]))
    tail++;
  const boilerplate = [...pages[0].slice(0, head), ...pages[0].slice(pages[0].length - tail)].map(lineText);
  return { body: pages.map((p) => p.slice(head, p.length - tail)), boilerplate };
}

const BANK_HINTS: [RegExp, string][] = [
  [/nubank\.com\.br|\bnu\s+pagamentos\b/i, "Nubank"],
  [/revolut\.com/i, "Revolut"],
  [/\bwise\.com\b/i, "Wise"],
  [/bancointer\.com\.br|\binter\.co\b/i, "Banco Inter"],
  [/caixabank\.(?:es|com)/i, "CaixaBank"],
];

export function readSectionedStatement(pages: PositionedLine[][]): SectionedStatement | null {
  const { body, boilerplate } = stripBoilerplate(pages);
  const lines = body.flat();
  const texts = lines.map(lineText);
  const currency: Currency = mostCited([...boilerplate, ...texts]) ?? "BRL";

  const rows: NormalizedRow[] = [];
  const sections: Section[] = [];
  const sectionRows = new Map<Section, NormalizedRow[]>();
  const preamble: string[] = [];
  const epilogue: string[] = [];
  let date: Date | null = null;
  let section: Section | null = null;
  let item: { row: NormalizedRow; x: number; parts: string[]; amount: Decimal } | null = null;

  const closeItem = () => {
    if (!item || !section) return;
    const description = item.parts
      .join(" ")
      .replace(/\s+/g, " ")
      .replace(/\s+-\s*$/, "")
      .trim();
    item.row.description = description;
    item.row.merchantRaw = description;
    item.row.sourceRowRaw = `${item.row.date.toISOString().slice(0, 10)}|${item.row.baseAmount}|${description}`;
    item = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const text = texts[i];
    const sec = text.match(SECTION);
    const d = sec ? findDates(text)[0] : undefined;
    // "Total de entradas" do resumo (antes do 1º dia) não abre seção.
    if (sec && (d || date)) {
      closeItem();
      if (d) date = d;
      const total = text.match(SIGNED_AT_END);
      if (!date || !total) return null; // não é o formato esperado
      const sign: 1 | -1 = /entradas|cr[ée]ditos/i.test(sec[1]) ? 1 : -1;
      section = { date, sign, total: parseMoney(total[2]).abs(), sum: new Decimal(0), ok: false };
      sections.push(section);
      sectionRows.set(section, []);
      continue;
    }
    if (!section) {
      preamble.push(text);
      continue;
    }
    const amount = text.match(AMOUNT_AT_END);
    if (amount) {
      closeItem();
      const value = parseMoney(amount[1]).abs().times(section.sign);
      const row: NormalizedRow = {
        date: section.date,
        description: "",
        merchantRaw: "",
        baseCurrency: currency,
        baseAmount: value.toFixed(4),
        feeAmount: "0.0000",
        type: value.isNegative() ? "EXPENSE" : "INCOME", // classificado depois
        state: "COMPLETED",
        isInternalTransfer: false,
        sourceRowRaw: "",
        sourceIsStatementLine: true,
      };
      rows.push(row);
      sectionRows.get(section)!.push(row);
      section.sum = section.sum.plus(value.abs());
      item = { row, x: minX(lines[i]), parts: [text.slice(0, amount.index).trim()], amount: value };
      continue;
    }
    // Continuação da descrição: recuada em relação ao começo do lançamento. Texto mais à
    // esquerda (avisos do fim do extrato) encerra o lançamento.
    if (item && minX(lines[i]) > item.x + 4) {
      item.parts.push(text);
      continue;
    }
    closeItem();
    epilogue.push(text);
  }
  closeItem();
  if (!sections.length || !rows.length) return null;

  const warnings: string[] = [];
  for (const s of sections) {
    s.ok = s.sum.eq(s.total);
    if (s.ok) continue;
    for (const r of sectionRows.get(s)!) {
      r.needsReview = true;
      r.reviewReason = SECTION_MISMATCH;
    }
    const sign = s.sign > 0 ? "entradas" : "saídas";
    warnings.push(
      `${s.date.toISOString().slice(0, 10)}: ${sign} somam ${s.sum.toFixed(2)}, o extrato diz ${s.total.toFixed(2)}`,
    );
  }

  // Resumo: "Saldo inicial 787,06" … "Saldo final do período 1,91".
  const pick = (re: RegExp) => {
    for (const t of preamble) {
      if (!re.test(t)) continue;
      const m = t.match(new RegExp(String.raw`(${MONEY})\s*$`));
      if (m) return parseMoney(m[1]);
    }
    return null;
  };
  const opening = pick(/^Saldo inicial\b/i);
  const closing = pick(/^Saldo final\b/i);
  let balanced: boolean | null = null;
  if (opening && closing) {
    const net = rows.reduce((s, r) => s.plus(r.baseAmount), new Decimal(0));
    balanced = opening.plus(net).eq(closing);
    if (!balanced) {
      warnings.push(
        `saldo inicial ${opening.toFixed(2)} + lançamentos ${net.toFixed(2)} não dá o saldo final ${closing.toFixed(2)}: confira se falta alguma linha`,
      );
    }
  }

  const all = [...boilerplate, ...preamble, ...epilogue].join("\n");
  const bank = BANK_HINTS.find(([re]) => re.test(all))?.[1] ?? null;
  return { rows, sections, bank, balanced, warnings };
}
