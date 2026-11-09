/**
 * Guarda as leituras do OCR de um PDF de imagem de fixtures/ em fixtures/ocr/<arquivo>.json
 * (fora do git), para o teste do leitor (tests/ocr-ledger.test.ts) não rodar o OCR toda vez.
 *
 *   npx tsx scripts/ocr-cache.mts CaixaBank_digital_CaixaBankNow_2026117.pdf
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ocrPdf } from "../src/lib/ingest/ocr/tesseract";
const f = process.argv[2];
const t = Date.now();
const passes = await ocrPdf(readFileSync(`fixtures/${f}`));
mkdirSync("fixtures/ocr", { recursive: true });
writeFileSync(`fixtures/ocr/${f}.json`, JSON.stringify(passes));
console.log(
  "passes",
  passes.length,
  "words",
  passes.reduce((s, p) => s + p.words.length, 0),
  "ms",
  Date.now() - t,
);
