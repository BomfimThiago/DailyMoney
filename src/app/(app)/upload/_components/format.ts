// Formatação de datas/tamanhos da tela Importar (não envolve dinheiro).

const TIME = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const DAY_MONTH = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
const FULL = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" });

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "hoje, 09:12" · "ontem, 22:40" · "19 de ago." */
export function relativeWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return `hoje, ${TIME.format(d)}`;
  if (sameDay(d, yesterday)) return `ontem, ${TIME.format(d)}`;
  return DAY_MONTH.format(d);
}

export function fullWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : FULL.format(d);
}

const SIZE = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${SIZE.format(bytes / 1024)} KB`;
  return `${SIZE.format(bytes / (1024 * 1024))} MB`;
}

/** Extensão em caixa alta ("CSV", "PDF"); vazio se não houver. */
export function fileExt(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(i + 1).toUpperCase() : "";
}
