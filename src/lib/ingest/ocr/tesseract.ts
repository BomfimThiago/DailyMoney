import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// OCR de PDF que é só imagem, sem IA: `pdftoppm` (poppler) desenha cada página e o
// `tesseract` lê as palavras com a posição de cada uma. Os dois são programas do sistema
// (Dockerfile: apk add poppler-utils tesseract-ocr tesseract-ocr-data-spa). Ninguém aqui
// decide número: cada leitura vira candidata, e quem escolhe é o saldo corrido
// (src/lib/ingest/ocr-ledger.ts).
//
// Uma leitura só erra dígitos ("3/4,30" no lugar de 574,30, "−392" no lugar de −398), e
// erra diferente em cada resolução. Por isso cada página é lida em três resoluções, e
// cada uma duas vezes: com texto (descrição e cabeçalho) e só com dígitos (os números).

const run = promisify(execFile);

export interface OcrWord {
  text: string;
  conf: number;
  /** Posição na página, de 0 a 1 (independe da resolução). */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Linha do tesseract (bloco.parágrafo.linha). */
  line: string;
}

export interface OcrPass {
  page: number;
  resolution: number;
  /** Só dígitos e pontuação de valores: os números saem mais limpos, o texto some. */
  numeric: boolean;
  words: OcrWord[];
}

export const OCR_RESOLUTIONS = [300, 400, 600];
const NUMERIC_CHARS = "0123456789-+.,/€$R";
const OCR_LANG = process.env.OCR_LANG || "spa";
const TIMEOUT_MS = 90_000;

/** As linhas TSV do tesseract (nível 5 = palavra) em palavras com posição relativa. */
export function parseTsv(tsv: string): OcrWord[] {
  const lines = tsv.split("\n").filter(Boolean);
  const head = lines.shift()?.split("\t") ?? [];
  const col = (name: string) => head.indexOf(name);
  const [iLevel, iBlock, iPar, iLine, iLeft, iTop, iW, iH, iConf, iText] = [
    "level",
    "block_num",
    "par_num",
    "line_num",
    "left",
    "top",
    "width",
    "height",
    "conf",
    "text",
  ].map(col);
  let pageW = 0;
  let pageH = 0;
  const words: OcrWord[] = [];
  for (const l of lines) {
    const c = l.split("\t");
    const level = Number(c[iLevel]);
    if (level === 1) {
      pageW = Number(c[iW]);
      pageH = Number(c[iH]);
      continue;
    }
    const text = (c[iText] ?? "").trim();
    if (level !== 5 || !text || !pageW || !pageH) continue;
    const left = Number(c[iLeft]);
    const top = Number(c[iTop]);
    words.push({
      text,
      conf: Number(c[iConf]),
      left: left / pageW,
      top: top / pageH,
      right: (left + Number(c[iW])) / pageW,
      bottom: (top + Number(c[iH])) / pageH,
      line: `${c[iBlock]}.${c[iPar]}.${c[iLine]}`,
    });
  }
  return words;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Os programas de OCR estão instalados? (Sem eles, o PDF de imagem não é lido.) */
export async function ocrAvailable(): Promise<boolean> {
  try {
    await Promise.all([run("tesseract", ["--version"]), run("pdftoppm", ["-v"])]);
    return true;
  } catch {
    return false;
  }
}

/** Lê as páginas do PDF por OCR: todas as passadas (resolução × texto/dígitos). */
export async function ocrPdf(bytes: Buffer | Uint8Array): Promise<OcrPass[]> {
  const dir = await mkdtemp(join(tmpdir(), "dm-ocr-"));
  try {
    const pdf = join(dir, "in.pdf");
    await writeFile(pdf, bytes);
    const images: { page: number; resolution: number; path: string }[] = [];
    for (const resolution of OCR_RESOLUTIONS) {
      await run("pdftoppm", ["-r", String(resolution), "-png", pdf, join(dir, `r${resolution}`)], {
        timeout: TIMEOUT_MS,
      });
    }
    for (const f of await readdir(dir)) {
      const m = /^r(\d+)-0*(\d+)\.png$/.exec(f);
      if (m) images.push({ resolution: Number(m[1]), page: Number(m[2]), path: join(dir, f) });
    }
    const jobs = images.flatMap((img) => [false, true].map((numeric) => ({ ...img, numeric })));
    const passes = await mapLimit(jobs, 4, async (j) => {
      const args = [j.path, "stdout", "-l", OCR_LANG, "--psm", "6"];
      if (j.numeric) args.push("-c", `tessedit_char_whitelist=${NUMERIC_CHARS}`);
      args.push("tsv");
      const { stdout } = await run("tesseract", args, { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
      return { page: j.page, resolution: j.resolution, numeric: j.numeric, words: parseTsv(stdout) };
    });
    return passes.sort(
      (a, b) => a.page - b.page || a.resolution - b.resolution || Number(a.numeric) - Number(b.numeric),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
