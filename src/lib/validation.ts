import { z } from "zod";
import { Decimal } from "@/lib/money";

// Esquemas Zod compartilhados pelas bordas da API.

/**
 * Valor de dinheiro que um cliente do app envia: decimal com ponto, sem milhar, até 4
 * casas ("-1234.5", "412.90"). O texto que a pessoa digita ("1.234,56") é convertido no
 * navegador por `parseMoneyInput`; aqui não se adivinha: "1.500" seria ambíguo.
 */
export const decimalAmount = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^-?\d+(\.\d{1,4})?$/.test(v), "Valor inválido: use número com ponto decimal (ex.: -45.20)")
  .transform((v) => new Decimal(v));

/** Dia (yyyy-mm-dd) ou data ISO completa. Dia sem horário vale meia-noite UTC, como os lançamentos. */
export const dateInput = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v) && !Number.isNaN(new Date(v).getTime()), "Data inválida")
  .transform((v) => new Date(v));
