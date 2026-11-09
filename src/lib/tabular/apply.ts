import type { Currency, TxState } from "@prisma/client";
import { Decimal, isCurrency } from "@/lib/money";
import { parseAmount, parseDate, detectCurrencyInCell } from "@/lib/tabular/normalize";
import { classifyTransaction } from "@/lib/ingest/classify";
import { checkBalances } from "@/lib/tabular/balance";
import type { FormatProfileSpec, NormalizedRow } from "@/lib/tabular/types";

export interface ApplyResult {
  rows: NormalizedRow[];
  errors: { rowIndex: number; message: string; raw: string }[];
}

// Apply a FormatProfile to data rows (header already removed). Pure + deterministic:
// the AI never touches these numbers. Bad rows are collected, not thrown, so one
// malformed line doesn't kill the whole import (but errors are surfaced).
export function applyProfile(
  profile: FormatProfileSpec,
  dataRows: string[][],
  /** Banco conhecido que marca a própria movimentação numa coluna (ver known-layouts.ts). */
  opts: { isInternal?: (cells: string[]) => boolean } = {},
): ApplyResult {
  const roles = profile.columnRoles;
  const rows: NormalizedRow[] = [];
  const errors: ApplyResult["errors"] = [];

  dataRows.forEach((cells, rowIndex) => {
    const raw = cells.join(profile.delimiter || ",");
    try {
      const amountCell = cells[roles.amount] ?? "";
      const amount = parseAmount(amountCell, profile.decimalSeparator);

      const dateFmt = profile.dateFormat === "YMD" ? "YMD" : profile.dateFormat;
      const date = parseDate(cells[roles.date] ?? "", dateFmt);

      const description = (cells[roles.description] ?? "").trim();

      const currency = resolveCurrency(cells, profile);

      const fee =
        roles.fee !== undefined && cells[roles.fee]
          ? parseAmount(cells[roles.fee], profile.decimalSeparator).abs()
          : new Decimal(0);

      const state: TxState = resolveState(roles.state !== undefined ? cells[roles.state] : undefined);

      const { type, isInternalTransfer } = classifyTransaction(amount);

      let balance: string | null = null;
      if (roles.balance !== undefined && cells[roles.balance]) {
        try {
          balance = parseAmount(cells[roles.balance], profile.decimalSeparator).toFixed(2);
        } catch {
          balance = null;
        }
      }

      rows.push({
        date,
        description,
        merchantRaw: description,
        baseCurrency: currency,
        baseAmount: amount.toFixed(4),
        feeAmount: fee.toFixed(4),
        type,
        state,
        isInternalTransfer: isInternalTransfer || Boolean(opts.isInternal?.(cells)),
        sourceRowRaw: raw,
        balance,
      });
    } catch (err) {
      errors.push({
        rowIndex,
        message: err instanceof Error ? err.message : "Erro ao processar linha",
        raw,
      });
    }
  });

  flagBalanceAnomalies(rows);
  return { rows, errors };
}

// Balance-check sensor: CSV/XLSX só marca para revisão (o sinal vem do arquivo, não
// de um palpite). Ver src/lib/tabular/balance.ts.
function flagBalanceAnomalies(rows: NormalizedRow[]): void {
  checkBalances(rows);
}

function resolveCurrency(cells: string[], profile: FormatProfileSpec): Currency {
  const roles = profile.columnRoles;
  if (roles.currency !== undefined) {
    const cell = (cells[roles.currency] ?? "").trim().toUpperCase();
    if (isCurrency(cell)) return cell;
    const detected = detectCurrencyInCell(cell);
    if (detected) return detected;
  }
  // Currency embedded in the amount cell (e.g. "-88,56EUR").
  const inAmount = detectCurrencyInCell(cells[roles.amount] ?? "");
  if (inAmount) return inAmount;
  if (profile.defaultCurrency) return profile.defaultCurrency;
  throw new Error("Não foi possível determinar a moeda da transação");
}

function resolveState(cell: string | undefined): TxState {
  if (!cell) return "COMPLETED";
  const s = cell.trim().toUpperCase();
  if (/PEND/.test(s)) return "PENDING";
  return "COMPLETED";
}
