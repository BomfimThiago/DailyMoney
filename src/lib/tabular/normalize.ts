import { Decimal } from "@/lib/money";
import type { Currency } from "@prisma/client";

export type DecimalSeparator = "," | ".";

// Parse a monetary cell into a Decimal, given the expected decimal separator.
// Handles: currency suffix/prefix (EUR, R$, $, €), thousands separators,
// leading/trailing minus, and (parentheses) as negatives.
export function parseAmount(raw: string, decimalSeparator: DecimalSeparator): Decimal {
  let s = (raw ?? "").trim();
  if (!s) return new Decimal(0);

  let negative = false;
  // Parentheses accounting notation → negative.
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Strip currency codes/symbols and spaces (incl. non-breaking).
  s = s.replace(/[A-Za-z$€£R\s ]/g, "");

  // Trailing or leading minus.
  if (s.includes("-")) {
    negative = true;
    s = s.replace(/-/g, "");
  }
  if (s.includes("+")) s = s.replace(/\+/g, "");

  if (decimalSeparator === ",") {
    // "1.234,56" → remove dots (thousands), comma → dot.
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // "1,234.56" → remove commas (thousands).
    s = s.replace(/,/g, "");
  }

  if (s === "" || s === ".") return new Decimal(0);
  let value: Decimal;
  try {
    value = new Decimal(s);
  } catch {
    throw new Error(`Valor monetário inválido: "${raw}"`);
  }
  return negative ? value.negated() : value;
}

/**
 * Valor solto (ex.: vindo da IA) sem saber o separador decimal de antemão.
 * Aceita number (já parseado do JSON) ou texto: "1.234,56", "1,234.56",
 * "-45.30", "R$ 412,90", "(12,00)", "−3,20". Regra do separador: se tem "," e
 * ".", o último é o decimal; só "," → decimal, a menos que tenha exatamente 3
 * dígitos depois (milhar: "1,234"); só "." → decimal. Retorna string decimal.
 * Lança em vez de virar 0 — valor ilegível nunca entra calado.
 */
export function parseLooseAmount(raw: string | number): string {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) throw new Error(`Valor monetário inválido: ${raw}`);
    return new Decimal(String(raw)).toString();
  }
  const s = raw.trim().replace(/−/g, "-");
  if (!/\d/.test(s)) throw new Error(`Valor monetário inválido: "${raw}"`);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let sep: DecimalSeparator = ".";
  if (lastComma >= 0 && lastDot >= 0) sep = lastComma > lastDot ? "," : ".";
  // Só vírgula: "1,234" / "12,345,678" é agrupamento de milhar; o resto é decimal.
  else if (lastComma >= 0) sep = /^[^\d]*\d{1,3}(,\d{3})+[^\d]*$/.test(s) ? "." : ",";
  return parseAmount(s, sep).toString();
}

// Detect the most likely decimal separator from sample amount cells.
export function detectDecimalSeparator(samples: string[]): DecimalSeparator {
  let commaDecimal = 0;
  let dotDecimal = 0;
  for (const raw of samples) {
    const s = (raw ?? "").replace(/[A-Za-z$€£R\s ()+-]/g, "");
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma === -1 && lastDot === -1) continue;
    // Whichever separator appears last (closest to the end) is the decimal one,
    // and only if it's followed by 1-2 digits.
    if (lastComma > lastDot && /,\d{1,2}$/.test(s)) commaDecimal++;
    else if (lastDot > lastComma && /\.\d{1,2}$/.test(s)) dotDecimal++;
  }
  return commaDecimal >= dotDecimal ? "," : ".";
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
  ene: 0,
  abr: 3,
  ago: 7,
  dic: 11, // es
  fev: 1,
  mai: 4,
  set: 8,
  out: 9,
  dez: 11, // pt
};

// Parse a date cell across common bank formats, always returning a VALID Date or
// throwing. Wraps the format-specific logic so an Invalid Date never leaks out
// (which would later blow up dedupeHash/toISOString).
export function parseDate(raw: string, dateFormat: "DMY" | "MDY" | "YMD" | "auto" = "auto"): Date {
  const d = parseDateInternal(raw, dateFormat);
  if (isNaN(d.getTime())) throw new Error(`Data inválida: "${raw}"`);
  return d;
}

// Monta a data em UTC e confere que nada "transbordou": Date.UTC aceita 31/02 e devolve
// 03/03 (e 99/99/2026 vira 2034) — uma linha corrompida viraria transação em outro dia.
function utc(raw: string, y: number, m: number, d: number, h = 0, min = 0, sec = 0): Date {
  const date = new Date(Date.UTC(y, m, d, h, min, sec));
  const ok =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === min &&
    date.getUTCSeconds() === sec;
  if (!ok) throw new Error(`Data inválida: "${raw}"`);
  return date;
}

function parseDateInternal(raw: string, dateFormat: "DMY" | "MDY" | "YMD" | "auto" = "auto"): Date {
  const s = (raw ?? "").trim();
  if (!s) throw new Error("Data vazia");

  // ISO: 2026-08-06 or 2026-08-06 16:14:02 or 2026-08-06T16:14:02
  const iso = /^(\d{4})-(\d{2})-(\d{2})([ T](\d{2}):(\d{2})(:(\d{2}))?)?/.exec(s);
  if (iso) {
    return utc(s, +iso[1], +iso[2] - 1, +iso[3], +(iso[5] ?? 0), +(iso[6] ?? 0), +(iso[8] ?? 0));
  }

  // Textual: "Aug 6, 2026" / "6 ago 2026"
  const textual = /([A-Za-z]{3,})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i.exec(s);
  if (textual) {
    const mon = MONTHS[textual[1].slice(0, 3).toLowerCase()];
    if (mon !== undefined) return utc(s, +textual[3], mon, +textual[2]);
  }
  const textual2 = /(\d{1,2})\s+([A-Za-z]{3,})[a-z]*\.?\s+(\d{4})/i.exec(s);
  if (textual2) {
    const mon = MONTHS[textual2[2].slice(0, 3).toLowerCase()];
    if (mon !== undefined) return utc(s, +textual2[3], mon, +textual2[1]);
  }

  // Numeric separators: dd/mm/yyyy, mm/dd/yyyy, dd.mm.yyyy, dd-mm-yyyy
  const parts = s.split(/[\/.\-]/).map((p) => p.trim());
  if (parts.length >= 3) {
    let [a, b, c] = parts;
    // Normalise 2-digit year.
    const yNum = (y: string) => (y.length === 2 ? 2000 + +y : +y);
    if (a.length === 4) {
      // YYYY-MM-DD
      return utc(s, +a, +b - 1, +c);
    }
    const day = +a;
    const month = +b;
    if (dateFormat === "MDY" || (dateFormat === "auto" && day > 12 && month <= 12 && false)) {
      return utc(s, yNum(c), +a - 1, +b);
    }
    // Default DMY (European/LatAm banks in these fixtures).
    return utc(s, yNum(c), month - 1, day);
  }

  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback;
  throw new Error(`Data inválida: "${raw}"`);
}

// Find a currency code inside a cell (e.g. "EUR", "R$", "USD", "€", "-88,56EUR").
// No word boundaries: the code is often glued to the number (e.g. "56EUR").
export function detectCurrencyInCell(raw: string): Currency | null {
  const s = (raw ?? "").toUpperCase();
  if (/BRL|R\$/.test(s)) return "BRL";
  if (/USD|US\$/.test(s)) return "USD";
  if (/EUR|€/.test(s)) return "EUR";
  if (s.includes("$")) return "USD";
  return null;
}
