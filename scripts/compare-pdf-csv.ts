/**
 * Mede a leitura de PDF por IA contra o CSV do MESMO extrato (o CSV é lido sem IA,
 * então serve de gabarito). Para cada par, conta quantas transações a IA acertou,
 * errou (valor/data) ou inventou/perdeu.
 *
 *   EXTRACTION_PROVIDER=ollama OLLAMA_MODEL=qwen2.5:3b \
 *     npx tsx --env-file=.env scripts/compare-pdf-csv.ts
 *
 * Os extratos são reais e ficam em fixtures/ (fora do git).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Decimal } from "@/lib/money";
import { parseTabular } from "@/lib/tabular/pipeline";
import { extractDocument } from "@/lib/ai/extract";
import type { NormalizedRow } from "@/lib/tabular/types";

const FIX = resolve(__dirname, "../fixtures");
const PAIRS = [
  { bank: "CaixaBank", csv: "extractDocument_20260820.csv", pdf: "extractDocument_20260820.pdf" },
  {
    bank: "Revolut jul",
    csv: "account-statement_2026-07-01_2026-07-31_es-es_0bd117.csv",
    pdf: "account-statement_2026-07-01_2026-07-31_es-es_7c8d2d.pdf",
  },
  {
    bank: "Revolut ago",
    csv: "account-statement_2026-08-01_2026-08-20_es-es_dfe6da.csv",
    pdf: "account-statement_2026-08-01_2026-08-20_es-es_4261f3.pdf",
  },
];
const PDF_ONLY = [
  "statement_143459558_EUR_2025-12-16_2026-08-19.pdf",
  "statement_143459274_USD_2025-12-16_2026-08-19.pdf",
  "statement_143459241_BRL_2025-12-16_2026-08-19.pdf",
  "Extrato-01-08-2025-a-19-08-2026-PDF.pdf",
];
const only = process.argv[2];

const day = (d: Date) => d.toISOString().slice(0, 10);
const amt = (r: NormalizedRow) => new Decimal(r.baseAmount);
const daysApart = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 86_400_000;

interface Report {
  bank: string;
  csv: number;
  pdf: number;
  exact: number;
  dateOff: { csv: NormalizedRow; pdf: NormalizedRow }[];
  signFlip: { csv: NormalizedRow; pdf: NormalizedRow }[];
  missing: NormalizedRow[];
  extra: NormalizedRow[];
  csvSum: Decimal;
  pdfSum: Decimal;
  seconds: number;
}

function compare(bank: string, truth: NormalizedRow[], got: NormalizedRow[], seconds: number): Report {
  const left = [...truth];
  const pool = [...got];
  const take = (pred: (c: NormalizedRow, p: NormalizedRow) => boolean) => {
    const pairs: { csv: NormalizedRow; pdf: NormalizedRow }[] = [];
    for (let i = left.length - 1; i >= 0; i--) {
      const j = pool.findIndex((p) => pred(left[i], p));
      if (j === -1) continue;
      pairs.push({ csv: left[i], pdf: pool[j] });
      left.splice(i, 1);
      pool.splice(j, 1);
    }
    return pairs;
  };
  const exact = take((c, p) => day(c.date) === day(p.date) && amt(c).eq(amt(p))).length;
  // Revolut tem duas datas (início/fim): até 3 dias de diferença com o mesmo valor
  // conta como "data trocada", não como transação errada.
  const dateOff = take((c, p) => amt(c).eq(amt(p)) && daysApart(c.date, p.date) <= 3);
  const signFlip = take((c, p) => amt(c).abs().eq(amt(p).abs()) && daysApart(c.date, p.date) <= 3);
  const sum = (rs: NormalizedRow[]) => rs.reduce((s, r) => s.plus(amt(r)), new Decimal(0));
  return {
    bank,
    csv: truth.length,
    pdf: got.length,
    exact,
    dateOff,
    signFlip,
    missing: left,
    extra: pool,
    csvSum: sum(truth),
    pdfSum: sum(got),
    seconds,
  };
}

const line = (r: NormalizedRow) => `${day(r.date)}  ${amt(r).toFixed(2).padStart(10)}  ${r.description.slice(0, 48)}`;

async function main() {
  console.log(`modelo: ${process.env.EXTRACTION_PROVIDER}/${process.env.OLLAMA_MODEL}\n`);
  for (const p of PAIRS) {
    if (only && !p.bank.toLowerCase().includes(only.toLowerCase())) continue;
    if (!existsSync(resolve(FIX, p.pdf))) {
      console.log(`${p.bank}: PDF ausente em fixtures/`);
      continue;
    }
    const truth = parseTabular(readFileSync(resolve(FIX, p.csv), "utf8")).applied.rows;
    const t0 = Date.now();
    let got: NormalizedRow[] = [];
    let missed: string[] = [];
    try {
      ({ rows: got, warnings: missed } = await extractDocument({
        filename: p.pdf,
        mime: "application/pdf",
        bytes: readFileSync(resolve(FIX, p.pdf)),
      }));
    } catch (e) {
      console.log(`${p.bank}: FALHOU — ${e instanceof Error ? e.message : e}\n`);
      continue;
    }
    const r = compare(p.bank, truth, got, (Date.now() - t0) / 1000);
    const withBal = got.filter((x) => x.balance != null).length;
    const review = got.filter((x) => x.reviewReason === "saldo não confere").length;
    const notIn = got.filter((x) => x.reviewReason === "valor não aparece no extrato").length;
    const signQ = got.filter((x) => x.reviewReason === "confira se é entrada ou saída").length;
    const pct = r.csv ? Math.round((r.exact / r.csv) * 100) : 0;
    console.log(`━━ ${r.bank}  (${r.seconds.toFixed(0)}s)`);
    console.log(
      `   CSV ${r.csv} transações · PDF ${r.pdf} · iguais ${r.exact} (${pct}%) · data diferente ${r.dateOff.length} · sinal trocado ${r.signFlip.length} · faltaram ${r.missing.length} · a mais ${r.extra.length}`,
    );
    console.log(
      `   com saldo ${withBal}/${got.length} · saldo não confere ${review} · valor fora do extrato ${notIn} · sinal a confirmar ${signQ} · avisos ${missed.length}`,
    );
    console.log(
      `   soma CSV ${r.csvSum.toFixed(2)} · soma PDF ${r.pdfSum.toFixed(2)} · diferença ${r.pdfSum.minus(r.csvSum).toFixed(2)}`,
    );
    for (const x of r.signFlip.slice(0, 8))
      console.log(`   ± sinal   CSV ${line(x.csv)}\n             PDF ${line(x.pdf)}`);
    for (const x of r.missing.slice(0, 10)) console.log(`   − faltou  ${line(x)}`);
    if (r.missing.length > 10) console.log(`   − … e mais ${r.missing.length - 10}`);
    for (const x of r.extra.slice(0, 10)) console.log(`   + a mais  ${line(x)}`);
    if (r.extra.length > 10) console.log(`   + … e mais ${r.extra.length - 10}`);
    for (const w of missed.slice(0, 4)) console.log(`   ! ${w.slice(0, 110)}`);
    console.log();
  }

  // Sem CSV para comparar: confere só o que o próprio PDF garante (linhas com saldo
  // conferido, avisos, sinais a confirmar).
  for (const pdf of PDF_ONLY) {
    if (only && !pdf.toLowerCase().includes(only.toLowerCase())) continue;
    if (!existsSync(resolve(FIX, pdf))) continue;
    const t0 = Date.now();
    try {
      const { bank, rows, warnings } = await extractDocument({
        filename: pdf,
        mime: "application/pdf",
        bytes: readFileSync(resolve(FIX, pdf)),
      });
      const review = rows.filter((x) => x.needsReview).length;
      // por moeda: somar moedas diferentes escondeu linhas com a moeda errada (Wise EUR)
      const byCur = new Map<string, Decimal>();
      for (const x of rows) byCur.set(x.baseCurrency, (byCur.get(x.baseCurrency) ?? new Decimal(0)).plus(amt(x)));
      const sum = [...byCur].map(([c, v]) => `${c} ${v.toFixed(2)}`).join(" · ");
      console.log(`━━ ${bank ?? "?"} · ${pdf.slice(0, 40)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      console.log(
        `   ${rows.length} transações · com saldo ${rows.filter((x) => x.balance != null).length} · para revisar ${review} · avisos ${warnings.length} · soma ${sum}`,
      );
      for (const w of warnings.slice(0, 4)) console.log(`   ! ${w.slice(0, 110)}`);
    } catch (e) {
      console.log(`${pdf}: FALHOU — ${e instanceof Error ? e.message : e}`);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
