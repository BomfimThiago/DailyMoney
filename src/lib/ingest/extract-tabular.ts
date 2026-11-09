import * as XLSX from "xlsx";

export type FileKind = "tabular" | "ofx" | "document" | "unsupported";

// Classify by extension/mime. Tabular = parsed deterministically; document = AI.
export function classifyFile(filename: string, mime: string): FileKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "ofx" || /ofx/.test(mime)) return "ofx";
  if (["csv", "tsv", "txt", "xls", "xlsx"].includes(ext)) return "tabular";
  if (/csv|excel|spreadsheet|text\/plain/.test(mime)) return "tabular";
  if (["pdf", "png", "jpg", "jpeg", "webp", "heic"].includes(ext)) return "document";
  if (/pdf|image\//.test(mime)) return "document";
  return "unsupported";
}

// Return delimited text for the tabular pipeline. XLSX is converted to CSV.
export function toDelimitedText(filename: string, bytes: Buffer): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "xls" || ext === "xlsx") {
    const wb = XLSX.read(bytes, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("Planilha vazia");
    return XLSX.utils.sheet_to_csv(sheet, { FS: "," });
  }
  return bytes.toString("utf8");
}
