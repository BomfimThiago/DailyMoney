import { createHash } from "crypto";

// Minimal RFC-4180-ish CSV parser supporting quoted fields, escaped quotes,
// and a configurable delimiter. Handles \n and \r\n line endings.
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  // Last field/row (if file doesn't end with newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop trailing empty rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Guess the delimiter by counting occurrences on the header line.
export function detectDelimiter(text: string): string {
  const firstLine = text.replace(/\r\n/g, "\n").split("\n")[0] ?? "";
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

// Fingerprint identifies "same layout" files: normalized header + delimiter.
export function headerFingerprint(headers: string[], delimiter: string): string {
  const norm = headers.map((h) => h.trim().toLowerCase()).join("|");
  return createHash("sha256").update(`${delimiter}::${norm}`).digest("hex").slice(0, 32);
}
