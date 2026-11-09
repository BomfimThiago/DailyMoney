import type { TxType } from "@prisma/client";
import { Decimal } from "@/lib/money";

/**
 * Tipo de uma linha importada, só pelo sinal: saiu dinheiro (negativo) = gasto; entrou
 * (positivo) = entrada. Nada é marcado como transferência interna automaticamente — um Pix
 * ou uma aplicação pode ser pagamento a alguém. Só o usuário marca "interna" (na revisão ou
 * na transação), e aí a linha fica fora dos totais de gasto e de entrada.
 */
export function classifyTransaction(amount: Decimal): { type: TxType; isInternalTransfer: false } {
  return { type: typeBySign(amount), isInternalTransfer: false };
}

/**
 * Gasto ou entrada pelo sinal. O tipo "TRANSFER" é legado (antigas marcações automáticas):
 * ao editar uma linha assim ela vira gasto/entrada, e o que a tira dos totais é só o
 * `isInternalTransfer` — uma única regra.
 */
export function typeBySign(amount: Decimal.Value): "EXPENSE" | "INCOME" {
  return new Decimal(amount).isNegative() ? "EXPENSE" : "INCOME";
}
