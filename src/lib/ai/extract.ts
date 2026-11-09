import { z } from "zod";
import { env } from "@/lib/env";
import { Decimal } from "@/lib/money";
import { classifyTransaction } from "@/lib/ingest/classify";
import type { NormalizedRow } from "@/lib/tabular/types";
import { parseDate, parseLooseAmount } from "@/lib/tabular/normalize";
import { checkBalances } from "@/lib/tabular/balance";
import { canonicalBank } from "@/lib/ingest/bank";
import { isBalanceLabel } from "@/lib/ingest/labels";
import { IMAGE_PDF_MESSAGE, isImageOnlyPdf, pdfLines, readSectionedStatement } from "@/lib/ingest/pdf-sections";
import { ocrAvailable, ocrPdf } from "@/lib/ingest/ocr/tesseract";
import { readOcrLedger } from "@/lib/ingest/ocr-ledger";
import {
  ambiguousLines,
  findDates,
  readLedger,
  reconcileWithLedger,
  rowFromLine,
  TRUSTED_AGREEMENT,
  type LedgerLine,
} from "@/lib/ingest/pdf-ledger";

// Structured schema the vision model must return. Validated before use so a
// hallucinated shape is rejected (and retried), never silently trusted.
// Lenient on purpose: free models return numbers as strings, null fees, and
// lowercase enums. We normalize here so a sloppy-but-correct response is accepted.
// Valores viram string decimal (nunca float). Ilegível = erro de validação
// (dispara o retry/rejeição), nunca 0 silencioso — antes "1.234,56" virava 0.
const moneyish = (opts: { optional: boolean }) =>
  z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === "") {
        if (opts.optional) return "0";
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "valor ausente" });
        return z.NEVER;
      }
      try {
        return parseLooseAmount(v);
      } catch (e) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: e instanceof Error ? e.message : "valor inválido" });
        return z.NEVER;
      }
    });

// Saldo é opcional e AUSENTE ≠ zero: sem saldo a linha só não é conferida.
// Saldo ilegível também vira null (não derruba a linha; a conferência a ignora).
const balanceish = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    try {
      return parseLooseAmount(v);
    } catch {
      return null;
    }
  });

const currencyish = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .pipe(z.enum(["BRL", "USD", "EUR"]));

const stateish = z
  .string()
  .nullish()
  .transform((v) => (v && /pend/i.test(v) ? "PENDING" : "COMPLETED"));

const extractedRowSchema = z.object({
  date: z.string().min(4),
  description: z.string().min(1),
  amount: moneyish({ optional: false }),
  currency: currencyish,
  fee: moneyish({ optional: true }),
  balance: balanceish,
  state: stateish,
});
const extractionSchema = z.object({
  bank: z.string().nullish(),
  transactions: z.array(extractedRowSchema),
});

// Parse tolerante: modelos locais às vezes emitem UMA linha malformada (ex.:
// description vazia). Validar linha-a-linha e descartar as inválidas é melhor do
// que falhar o documento inteiro (mantém o resto das transações, req. lenient).
function coerceExtraction(raw: unknown): z.infer<typeof extractionSchema> {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bank = typeof obj.bank === "string" ? obj.bank : null;
  const list = Array.isArray(obj.transactions) ? obj.transactions : [];
  const transactions = list.flatMap((row) => {
    const p = extractedRowSchema.safeParse(row);
    return p.success ? [p.data] : [];
  });
  return { bank, transactions };
}

export interface ExtractDocumentParams {
  filename: string;
  mime: string;
  bytes: Buffer;
}

const SYSTEM_PROMPT = `Você extrai transações financeiras de extratos/recibos bancários (qualquer banco, idioma ou moeda).
Regras:
- Responda APENAS com JSON válido no formato: {"bank": "<nome do banco/fintech>", "transactions":[{"date","description","amount","currency","fee","balance","state"}]}.
- "bank": identifique o banco/fintech emissor do documento (ex.: "Revolut", "Wise", "Nubank", "BBVA"). Se não conseguir identificar, use null.
- "amount": número negativo para saídas/gastos, positivo para entradas. Use ponto decimal. Se o extrato separa colunas de saída e entrada (ex.: "Dinero saliente"/"Dinero entrante", "Débito"/"Crédito"), o lado da coluna define o sinal.
- "balance": o saldo da conta logo depois da transação, exatamente como aparece na linha do extrato (coluna "Saldo"/"Balance"). Se a linha não mostra saldo, use null.
- Uma linha por transação, na ordem do documento, incluindo juros e transações de outras contas/seções do mesmo extrato.
- "currency": uma de BRL, USD, EUR (detecte pelo símbolo/código; R$=BRL, $=USD, €=EUR).
- "date": formato ISO YYYY-MM-DD (a data da transação/compra).
- Não invente transações. Se um valor estiver ilegível, omita a linha.
- Linhas de saldo ("Saldo do dia", "Saldo anterior", "Saldo final", totais do dia) NÃO são transações: não as inclua.`;

export interface ExtractDocumentResult {
  bank: string | null;
  rows: NormalizedRow[];
  /** Problemas da leitura para mostrar na importação (linhas puladas/descartadas). */
  warnings: string[];
  /** Tudo saiu do texto do PDF, sem IA (extrato por seções conferido pelos totais). */
  readFromText?: boolean;
  /** PDF de imagem lido por OCR e conferido pelo saldo corrido, sem IA. */
  readByOcr?: boolean;
  /** Linhas que precisam do usuário: a importação mostra e nada desta fonte é removido. */
  rowErrors?: { rowIndex: number; message: string; raw: string }[];
}

export async function extractDocument(params: ExtractDocumentParams): Promise<ExtractDocumentResult> {
  // Extrato por seções com totais (ex.: Nubank): tudo sai do texto, conferido pelos
  // totais impressos — sem IA, em segundos. Outros formatos seguem para a IA + razão.
  if (isPdf(params)) {
    const lines = await pdfLines(params.bytes).catch(() => null);
    // Só imagem: nenhum provedor de IA recebe (um modelo de visão leria os números da
    // imagem). OCR sem IA, e cada valor conferido pelo saldo corrido impresso.
    if (lines && isImageOnlyPdf(lines)) {
      if (!(await ocrAvailable())) throw new Error(`${IMAGE_PDF_MESSAGE} (O servidor não tem o OCR instalado.)`);
      const ocr = readOcrLedger(await ocrPdf(params.bytes));
      if (!ocr) {
        throw new Error(
          `${IMAGE_PDF_MESSAGE} (O OCR não achou uma tabela com data, valor e saldo para conferir os números.)`,
        );
      }
      classifyRows(ocr.rows);
      return { bank: ocr.bank, rows: ocr.rows, warnings: ocr.warnings, rowErrors: ocr.rowErrors, readByOcr: true };
    }
    const sectioned = readSectionedStatement(lines ?? []);
    if (sectioned) {
      classifyRows(sectioned.rows);
      return { bank: sectioned.bank, rows: sectioned.rows, warnings: sectioned.warnings, readFromText: true };
    }
  }
  const raw = await runExtraction(params);
  const bank = canonicalBank(raw.bank);
  // "Saldo do dia", "Saldo anterior"…: a IA às vezes devolve o saldo impresso como se
  // fosse lançamento (vira uma despesa/entrada falsa). Sai antes de tudo, com aviso.
  const balanceLines = raw.transactions.filter((t) => isBalanceLabel(t.description));
  raw.transactions = raw.transactions.filter((t) => !isBalanceLabel(t.description));
  // Pares (valor, saldo) lidos do texto do PDF sem IA: definem os números.
  const ledger = isPdf(params) ? readLedger(await extractPdfPages(params.bytes).catch(() => [])) : [];
  let { rows, unmatched, dropped, dateAgreement } = normalizeExtracted(raw.transactions, ledger);
  // As datas da IA não bateram com nenhum lugar do texto (o 3b erra datas em extratos
  // longos): calibra com uma amostra pequena lida em lotes, e refaz a conciliação.
  if (dateAgreement < TRUSTED_AGREEMENT) {
    const sample = ambiguousLines(ledger).slice(0, RECOVER_BATCH);
    if (sample.length >= 3) {
      const answers = await askLines(sample).catch(() => new Map<number, LineAnswer>());
      const samples = sample.flatMap((l) => {
        const a = answers.get(l.index);
        return a ? [[l, a.date] as [LedgerLine, Date]] : [];
      });
      if (samples.length >= 3) ({ rows, unmatched, dropped } = normalizeExtracted(raw.transactions, ledger, samples));
    }
  }

  const warnings: string[] = [];
  if (balanceLines.length > 0) {
    const sample = [...new Set(balanceLines.map((t) => t.description.trim()))]
      .slice(0, 2)
      .map((d) => `«${d}»`)
      .join(", ");
    warnings.push(
      `${balanceLines.length} linha(s) de saldo lidas pela IA não são transações e foram ignoradas: ${sample}`,
    );
  }
  if (unmatched.length > 0) {
    const fallback = majority(rows.map((r) => r.baseCurrency));
    const { recovered, failed } = await recoverLines(unmatched, fallback);
    rows.push(...recovered);
    rows.sort((a, b) => (ledgerIndex.get(a) ?? 0) - (ledgerIndex.get(b) ?? 0));
    for (const l of failed) warnings.push(`a IA não leu «${l.text}»`);
  }
  if (dropped.length > 0) {
    const sample = dropped
      .slice(0, 3)
      .map((r) => `«${r.description} ${r.baseAmount.replace(/0+$/, "").replace(/\.$/, "")}»`);
    warnings.push(
      `${dropped.length} linha(s) lidas pela IA não existem no extrato e foram descartadas: ${sample.join(", ")}${dropped.length > 3 ? "…" : ""}`,
    );
  }
  classifyRows(rows);
  return { bank, rows, warnings };
}

const isPdf = (p: { mime: string; filename: string }) =>
  !p.mime.startsWith("image/") && (p.mime.includes("pdf") || p.filename.toLowerCase().endsWith(".pdf"));

// Posição de cada linha no extrato, para devolver tudo na ordem do documento.
const ledgerIndex = new WeakMap<NormalizedRow, number>();

/**
 * Transforma o que a IA devolveu em linhas e confere os NÚMEROS: com o razão do
 * PDF (src/lib/ingest/pdf-ledger.ts), valor, saldo e sinal vêm do texto e as linhas
 * do extrato que a IA pulou voltam em `unmatched`; sem ele, o sinal é conferido pelo
 * saldo que a própria IA leu. Não classifica (isso depende do sinal final).
 * Exportada para teste.
 */
export function normalizeExtracted(
  transactions: z.infer<typeof extractedRowSchema>[],
  ledger: LedgerLine[] = [],
  samples: [LedgerLine, Date][] = [],
): { rows: NormalizedRow[]; unmatched: LedgerLine[]; dropped: NormalizedRow[]; dateAgreement: number } {
  const rows: NormalizedRow[] = [];
  for (const t of transactions) {
    let date: Date;
    try {
      date = parseDate(t.date, "auto");
    } catch {
      continue; // skip unparseable date rather than fail the whole doc
    }
    if (isNaN(date.getTime())) continue; // guard against invalid dates from the model
    rows.push({
      date,
      description: t.description.trim(),
      merchantRaw: t.description.trim(),
      baseCurrency: t.currency,
      baseAmount: new Decimal(t.amount).toFixed(4),
      feeAmount: new Decimal(t.fee ?? 0).abs().toFixed(4),
      balance: t.balance ? new Decimal(t.balance).toFixed(2) : null,
      type: "EXPENSE", // definido por classifyRows, depois da conferência
      state: t.state ?? "COMPLETED",
      isInternalTransfer: false,
      sourceRowRaw: JSON.stringify(t),
    });
  }

  const plan = reconcileWithLedger(rows, ledger, samples);
  if (plan === null) {
    // Sem razão no texto (foto, PDF sem saldo): confere com o saldo lido pela IA.
    // Cada moeda é uma conta com sua própria série de saldos.
    for (const cur of new Set(rows.map((r) => r.baseCurrency))) {
      checkBalances(
        rows.filter((r) => r.baseCurrency === cur),
        { fixSigns: true },
      );
    }
    return { rows, unmatched: [], dropped: [], dateAgreement: 1 };
  }
  plan.rows.forEach((r, i) => ledgerIndex.set(r, ledgerIndexOf(r, ledger) ?? i));
  return plan;
}

function ledgerIndexOf(r: NormalizedRow, ledger: LedgerLine[]): number | undefined {
  return ledger.find(
    (l) => r.balance && l.balance.toFixed(2) === r.balance && l.amount.abs().eq(new Decimal(r.baseAmount).abs()),
  )?.index;
}

export function classifyRows(rows: NormalizedRow[]): void {
  for (const r of rows) {
    const { type, isInternalTransfer } = classifyTransaction(new Decimal(r.baseAmount));
    r.type = type;
    r.isInternalTransfer = isInternalTransfer;
  }
}

function majority<T>(xs: T[]): T | null {
  const n = new Map<T, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  let best: T | null = null;
  for (const [x, c] of n) if (best === null || c > (n.get(best) ?? 0)) best = x;
  return best;
}

// ── 2ª leitura: linhas do extrato que a IA pulou ──────────────────────────────
// Valor, sinal e saldo já são conhecidos (vieram do texto); a IA só precisa dizer
// data e descrição de cada linha. Lotes pequenos: modelos locais pequenos pulam
// linhas quando a entrada é grande, e é exatamente isso que estamos consertando.
const RECOVER_BATCH = 12;
const RECOVER_PROMPT = `Cada item numerado abaixo é UMA transação de um extrato bancário; o valor já é conhecido.
Para cada id, devolva a data da transação e uma descrição curta (o comerciante ou a contraparte; sem valores e sem linhas como "Referencia:", "Tarjeta:" ou "Transação:").
A data pode estar no próprio item, num cabeçalho antes dele ou na linha seguinte (separadas por ⏎).
Responda APENAS JSON: {"items":[{"id":1,"date":"YYYY-MM-DD","description":"..."}]}`;

const recoveredSchema = z.object({
  items: z.array(z.object({ id: z.coerce.number(), date: z.string().min(4), description: z.string().min(1) })),
});

interface LineAnswer {
  date: Date;
  description: string;
}

/** Data e descrição de cada linha do extrato, lidas pela IA em lotes pequenos. */
async function askLines(lines: LedgerLine[]): Promise<Map<number, LineAnswer>> {
  const out = new Map<number, LineAnswer>();
  for (let i = 0; i < lines.length; i += RECOVER_BATCH) {
    const batch = lines.slice(i, i + RECOVER_BATCH);
    const prompt = batch.map((l, k) => `${k + 1}. ${l.context}`).join("\n");
    let items: z.infer<typeof recoveredSchema>["items"] = [];
    try {
      const parsed = recoveredSchema.safeParse(parseJsonLoose(await askJson(RECOVER_PROMPT, prompt)));
      if (parsed.success) items = parsed.data.items;
    } catch {
      // o lote inteiro falhou: as linhas ficam sem resposta
    }
    batch.forEach((l, k) => {
      const item = items.find((it) => it.id === k + 1);
      if (!item) return;
      let date: Date | null = null;
      try {
        date = findDates(item.date)[0] ?? parseDate(item.date, "auto");
      } catch {
        date = null;
      }
      if (date && !isNaN(date.getTime())) out.set(l.index, { date, description: item.description.trim() });
    });
  }
  return out;
}

async function recoverLines(
  lines: LedgerLine[],
  fallbackCurrency: NormalizedRow["baseCurrency"] | null,
): Promise<{ recovered: NormalizedRow[]; failed: LedgerLine[] }> {
  const answers = await askLines(lines);
  const recovered: NormalizedRow[] = [];
  const failed: LedgerLine[] = [];
  for (const l of lines) {
    const a = answers.get(l.index);
    const currency = l.currency ?? fallbackCurrency;
    if (!a || !currency) {
      failed.push(l);
      continue;
    }
    const row = rowFromLine({ ...l, description: a.description || l.description }, a.date, currency);
    ledgerIndex.set(row, l.index);
    recovered.push(row);
  }
  return { recovered, failed };
}

/** Uma chamada de texto → JSON no provedor configurado (Ollama ou OpenRouter). */
async function askJson(system: string, user: string): Promise<string> {
  if (env.EXTRACTION_PROVIDER === "ollama") return ollamaChat(system, user);
  const models = env.OPENROUTER_VISION_MODEL.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let lastErr: unknown;
  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": env.OPENROUTER_APP_URL,
          "X-Title": env.OPENROUTER_APP_NAME,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(env.OPENROUTER_TIMEOUT_MS),
      });
      if (!res.ok) {
        lastErr = new Error(`OpenRouter ${res.status} (${model})`);
        continue;
      }
      const json = await res.json();
      return json.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const CHUNK_THRESHOLD = 4; // PDFs with more pages get split
const PAGES_PER_CHUNK = 3;
const CHUNK_CONCURRENCY = 2;

// Big multi-page PDFs (e.g. 8-month statements) are slow and can truncate in one
// call. Split into small page-chunks, extract each, and merge — each call is
// smaller/faster and won't hit the token limit. Falls back to one call on error.
async function runExtraction(params: ExtractDocumentParams): Promise<z.infer<typeof extractionSchema>> {
  // Ollama (local/grátis): PDFs viram texto extraído localmente; imagens vão a
  // um modelo de visão. OpenRouter continua como provider alternativo.
  if (env.EXTRACTION_PROVIDER === "ollama") return runOllamaExtraction(params);

  if (!isPdf(params)) return callOpenRouter(params);

  let chunks: Buffer[] | null = null;
  try {
    chunks = await splitPdf(params.bytes, PAGES_PER_CHUNK, CHUNK_THRESHOLD);
  } catch {
    chunks = null;
  }
  if (!chunks || chunks.length <= 1) return callOpenRouter(params);

  const results = await mapLimit(chunks, CHUNK_CONCURRENCY, (buf, i) =>
    callOpenRouter({ ...params, bytes: buf, filename: `${params.filename}.part${i + 1}.pdf` }).catch(
      () => ({ bank: null, transactions: [] }) as z.infer<typeof extractionSchema>,
    ),
  );

  const merged: z.infer<typeof extractionSchema> = { bank: null, transactions: [] };
  for (const r of results) {
    if (!merged.bank && r.bank) merged.bank = r.bank;
    merged.transactions.push(...r.transactions);
  }
  return merged;
}

// Split a PDF into chunks of N pages (preserving the text layer). Returns [bytes]
// unchanged if the PDF has <= threshold pages.
async function splitPdf(bytes: Buffer, pagesPerChunk: number, threshold: number): Promise<Buffer[]> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  if (total <= threshold) return [bytes];

  const chunks: Buffer[] = [];
  for (let start = 0; start < total; start += pagesPerChunk) {
    const doc = await PDFDocument.create();
    const idxs: number[] = [];
    for (let p = start; p < Math.min(start + pagesPerChunk, total); p++) idxs.push(p);
    const copied = await doc.copyPages(src, idxs);
    copied.forEach((pg) => doc.addPage(pg));
    chunks.push(Buffer.from(await doc.save()));
  }
  return chunks;
}

// Run an async fn over items with a concurrency cap, preserving order.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function callOpenRouter(params: ExtractDocumentParams): Promise<z.infer<typeof extractionSchema>> {
  const dataUrl = `data:${params.mime};base64,${params.bytes.toString("base64")}`;
  const isImage = params.mime.startsWith("image/");
  const content: unknown[] = [{ type: "text", text: "Extraia todas as transações deste documento." }];
  // OpenRouter accepts images via image_url; PDFs via the file part.
  if (isImage) {
    content.push({ type: "image_url", image_url: { url: dataUrl } });
  } else {
    content.push({ type: "file", file: { filename: params.filename, file_data: dataUrl } });
  }

  const baseBody: Record<string, unknown> = {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    temperature: 0,
    max_tokens: 16000, // reasoning models spend tokens thinking before the JSON
    response_format: { type: "json_object" },
  };
  // For PDFs use OpenRouter's free "pdf-text" engine (extracts the text layer).
  // Scanned PDFs without a text layer would need an OCR engine (paid).
  if (!isImage) {
    baseBody.plugins = [{ id: "file-parser", pdf: { engine: "pdf-text" } }];
  }

  // Fallback list: free models get pulled (404) / rate-limited (429) often, so
  // try each in order until one answers.
  const models = env.OPENROUTER_VISION_MODEL.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let lastErr: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": env.OPENROUTER_APP_URL,
            "X-Title": env.OPENROUTER_APP_NAME,
          },
          body: JSON.stringify({ ...baseBody, model }),
          signal: AbortSignal.timeout(env.OPENROUTER_TIMEOUT_MS),
        });
        if (!res.ok) {
          const text = await res.text();
          lastErr = new Error(`OpenRouter ${res.status} (${model}): ${text.slice(0, 160)}`);
          // Model unavailable or rate-limited → skip straight to the next model.
          if (res.status === 404 || res.status === 429) break;
          throw lastErr;
        }
        const json = await res.json();
        const contentStr: string = json.choices?.[0]?.message?.content ?? "";
        return coerceExtraction(parseJsonLoose(contentStr));
      } catch (err) {
        lastErr = err;
        // A timeout means the free models are just slow — don't burn more minutes.
        if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
          throw new Error(
            "Não foi possível extrair o documento por IA: o modelo demorou demais (modelos grátis são lentos). Tente reprocessar, ou importe o extrato em CSV/XLSX.",
          );
        }
        // Otherwise retry once, then fall through to the next model.
      }
    }
  }
  throw new Error(
    `Não foi possível extrair o documento por IA: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

// ── Ollama (local/self-hosted, grátis — sem API key) ─────────────────────────
// PDFs: extraímos a camada de texto localmente (unpdf) e mandamos a um modelo de
// texto. Imagens: vão a um modelo de visão (OLLAMA_VISION_MODEL obrigatório).
// Chunks pequenos: modelos locais menores (ex.: qwen2.5:3b) entram em loop de
// repetição com entradas grandes — menos páginas por chamada reduz o risco.
const OLLAMA_PAGES_PER_CHUNK = 3;

async function runOllamaExtraction(params: ExtractDocumentParams): Promise<z.infer<typeof extractionSchema>> {
  if (params.mime.startsWith("image/")) {
    if (!env.OLLAMA_VISION_MODEL) {
      throw new Error(
        "Extração de imagem por IA requer um modelo de visão: defina OLLAMA_VISION_MODEL (ex.: llama3.2-vision) e rode `ollama pull`, ou envie o extrato em PDF/CSV/XLSX.",
      );
    }
    const dataUrl = `data:${params.mime};base64,${params.bytes.toString("base64")}`;
    return callOllamaVision(`Extraia todas as transações deste documento.`, dataUrl);
  }

  let pages: string[];
  try {
    pages = await extractPdfPages(params.bytes);
  } catch (err) {
    throw new Error(
      `Não foi possível ler o texto do PDF: ${err instanceof Error ? err.message : String(err)}. Se for um PDF escaneado, envie CSV/XLSX.`,
    );
  }
  const nonEmpty = pages.filter((p) => p.trim().length > 0);
  if (nonEmpty.length === 0) {
    throw new Error(IMAGE_PDF_MESSAGE);
  }

  // Agrupa páginas em chunks para extratos longos não estourarem o contexto.
  const chunks: string[] = [];
  for (let i = 0; i < nonEmpty.length; i += OLLAMA_PAGES_PER_CHUNK) {
    chunks.push(nonEmpty.slice(i, i + OLLAMA_PAGES_PER_CHUNK).join("\n\n"));
  }

  // Sequencial (limit 1): um servidor Ollama local não ganha com paralelismo.
  // Erros de chunk são coletados — não engolidos — para que uma falha sistêmica
  // (modelo em loop, servidor fora) vire FAILED visível, não "0 transações".
  const errors: string[] = [];
  const results = await mapLimit(chunks, 1, (text) =>
    callOllamaText(`Extraia todas as transações deste extrato:\n\n${text}`).catch((e) => {
      errors.push(e instanceof Error ? e.message : String(e));
      return { bank: null, transactions: [] } as z.infer<typeof extractionSchema>;
    }),
  );

  const merged: z.infer<typeof extractionSchema> = { bank: null, transactions: [] };
  for (const r of results) {
    if (!merged.bank && r.bank) merged.bank = r.bank;
    merged.transactions.push(...r.transactions);
  }

  // Nenhuma transação E houve erro → falha de verdade, evidencie (req. 13).
  // errors[0] já traz o prefixo "...(Ollama): <causa>" vindo de ollamaCall.
  if (merged.transactions.length === 0 && errors.length > 0) {
    throw new Error(`${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} erro(s) em outros trechos)` : ""}`);
  }
  return merged;
}

// Texto da camada do PDF, uma string por página. Import dinâmico p/ manter o
// unpdf fora de bundles que nunca tocam documentos (igual ao pdf-lib).
async function extractPdfPages(bytes: Buffer): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

// Texto (PDF): endpoint NATIVO /api/chat, em STREAMING. Streaming é essencial em
// CPU: o `fetch` do Node (undici) tem headersTimeout/bodyTimeout fixos (~5min) que
// NÃO respeitam o AbortSignal; com stream:false uma inferência CPU longa (extrato
// denso) estoura esses 5min com HEADERS_TIMEOUT. Em streaming os headers chegam
// na hora e os tokens fluem contínuos, então só o nosso AbortSignal limita o total.
// `num_predict` limita a saída (impede loop infinito → 500 "token repeat limit");
// `repeat_penalty` suave (1.1) — valores altos fazem o modelo emitir campos vazios.
async function callOllamaText(prompt: string): Promise<z.infer<typeof extractionSchema>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return coerceExtraction(parseJsonLoose(await ollamaChat(SYSTEM_PROMPT, prompt)));
    } catch (err) {
      lastErr = err;
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new Error(
          "Não foi possível extrair o documento por IA: o Ollama demorou demais (CPU é lento para extratos grandes). Tente reprocessar, ou importe o extrato em CSV/XLSX.",
        );
      }
      // senão, tenta mais uma vez
    }
  }
  throw new Error(
    `Não foi possível extrair o documento por IA (Ollama): ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

// Uma conversa de texto com o Ollama, em streaming, devolvendo o conteúdo (JSON).
async function ollamaChat(system: string, user: string): Promise<string> {
  const res = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OLLAMA_MODEL,
      stream: true,
      format: "json",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      options: { temperature: 0, repeat_penalty: 1.1, num_predict: 6000, num_ctx: 16384 },
    }),
    signal: AbortSignal.timeout(env.OLLAMA_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) {
    const text = res.ok ? "resposta sem corpo" : await res.text();
    throw new Error(`Ollama ${res.status} (${env.OLLAMA_MODEL}): ${text.slice(0, 160)}`);
  }
  // NDJSON: uma linha por token, {message:{content}, done}. Acumula o content.
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const obj = JSON.parse(line);
      if (obj.error) throw new Error(`Ollama: ${String(obj.error).slice(0, 160)}`);
      if (obj.message?.content) content += obj.message.content as string;
    }
  }
  return content;
}

// Imagem: endpoint OpenAI-compat /v1/chat/completions com image_url (modelo de visão).
async function callOllamaVision(prompt: string, dataUrl: string): Promise<z.infer<typeof extractionSchema>> {
  return ollamaCall(
    "/v1/chat/completions",
    {
      model: env.OLLAMA_VISION_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    },
    (j) => j.choices?.[0]?.message?.content ?? "",
    env.OLLAMA_VISION_MODEL,
  );
}

// POST + parse + retry compartilhado para as chamadas ao Ollama local (sem chave).
async function ollamaCall(
  path: string,
  body: Record<string, unknown>,
  pick: (json: any) => string,
  model: string,
): Promise<z.infer<typeof extractionSchema>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${env.OLLAMA_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(env.OLLAMA_TIMEOUT_MS),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama ${res.status} (${model}): ${text.slice(0, 160)}`);
      }
      const json = await res.json();
      return coerceExtraction(parseJsonLoose(pick(json)));
    } catch (err) {
      lastErr = err;
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new Error(
          "Não foi possível extrair o documento por IA: o Ollama demorou demais. Verifique se o servidor está no ar e o modelo baixado.",
        );
      }
      // senão, tenta mais uma vez
    }
  }
  throw new Error(
    `Não foi possível extrair o documento por IA (Ollama): ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

// JSON da resposta do modelo, tolerante a corte: modelos locais pequenos às vezes
// quebram o JSON no meio de uma lista longa (vírgula faltando, resposta truncada).
// Em vez de perder o trecho inteiro, fica com os itens completos antes da quebra —
// os números são conferidos pelo texto do extrato depois, e o que faltar vira aviso.
// Exportada para teste.
export function parseJsonLoose(s: string): unknown {
  const block = extractJsonBlock(s);
  try {
    return JSON.parse(block);
  } catch (err) {
    let end = block.lastIndexOf("}");
    for (let tries = 0; end > 0 && tries < 400; tries++) {
      const head = block.slice(0, end + 1);
      for (const tail of ["]}", "}]}", "]", ""]) {
        try {
          return JSON.parse(head + tail);
        } catch {
          // tenta um fechamento mais curto
        }
      }
      end = block.lastIndexOf("}", end - 1);
    }
    throw err;
  }
}

// Models sometimes wrap JSON in ```json fences or prose — extract the object.
function extractJsonBlock(s: string): string {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  if (fence) return fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1) return s.slice(first, last + 1);
  return s;
}
