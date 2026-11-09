import type { Currency } from "@prisma/client";

// Cabeçalhos exportados por bancos conhecidos: identificam o banco (que o CSV não diz) e,
// quando o arquivo não traz moeda nem símbolo, a moeda da conta. Só cabeçalhos
// distintivos entram aqui; um genérico ("Fecha;Concepto;Importe") não diz o banco.

interface KnownLayout {
  headers: string[];
  bank: string;
  currency?: Currency;
  /**
   * Linhas que o próprio banco marca como dinheiro mudando de lugar (ex.: Wise, câmbio entre
   * as moedas da conta): a coluna (pelo nome no cabeçalho) e os valores que indicam isso.
   */
  internal?: { column: string; values: string[] };
}

const LAYOUTS: KnownLayout[] = [
  // Nubank conta (app → Extrato → CSV): valores sem moeda, sempre em reais
  { headers: ["data", "valor", "identificador", "descrição"], bank: "Nubank", currency: "BRL" },
  // Revolut (es e en): a moeda vem na coluna Divisa/Currency
  {
    headers: [
      "tipo",
      "producto",
      "fecha de inicio",
      "fecha de finalización",
      "descripción",
      "importe",
      "comisión",
      "divisa",
      "state",
      "saldo",
    ],
    bank: "Revolut",
  },
  {
    headers: [
      "type",
      "product",
      "started date",
      "completed date",
      "description",
      "amount",
      "fee",
      "currency",
      "state",
      "balance",
    ],
    bank: "Revolut",
  },
  // Wise (Statements → CSV, uma moeda por arquivo): a moeda vem na coluna Currency.
  // "Transaction Details Type" = CONVERSION é câmbio entre as moedas da própria conta:
  // sai de uma e entra na outra, nunca gasto nem entrada.
  {
    headers: [
      "transferwise id",
      "date",
      "date time",
      "amount",
      "currency",
      "description",
      "payment reference",
      "running balance",
      "exchange from",
      "exchange to",
      "exchange rate",
      "payer name",
      "payee name",
      "payee account number",
      "merchant",
      "card last four digits",
      "card holder full name",
      "attachment",
      "note",
      "total fees",
      "exchange to amount",
      "transaction type",
      "transaction details type",
    ],
    bank: "Wise",
    internal: { column: "transaction details type", values: ["CONVERSION"] },
  },
];

const norm = (h: string) => h.replace(/^﻿/, "").trim().toLowerCase().replace(/\s+/g, " ");

export interface KnownLayoutMatch {
  bank: string;
  currency: Currency | null;
  /** A linha (células) é movimentação segundo o próprio banco. */
  isInternal: ((cells: string[]) => boolean) | null;
}

export function knownLayout(headers: string[]): KnownLayoutMatch | null {
  const got = headers.map(norm);
  const hit = LAYOUTS.find((l) => l.headers.length === got.length && l.headers.every((h, i) => h === got[i]));
  if (!hit) return null;
  const col = hit.internal ? got.indexOf(hit.internal.column) : -1;
  const values = new Set(hit.internal?.values.map((v) => v.toUpperCase()));
  return {
    bank: hit.bank,
    currency: hit.currency ?? null,
    isInternal: col >= 0 ? (cells) => values.has((cells[col] ?? "").trim().toUpperCase()) : null,
  };
}
