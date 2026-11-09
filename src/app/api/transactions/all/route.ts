import { z } from "zod";
import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { deleteAllTransactions, purgeOverview } from "@/lib/transactions/purge";

export const dynamic = "force-dynamic";

/** O que "Apagar todas as transações" vai levar (o diálogo mostra antes de confirmar). */
export const GET = handle(async () => {
  const user = await requireUser();
  return json(await purgeOverview(user.id));
});

// Exige a palavra digitada pelo usuário e o número que ele viu: um pedido sem isso
// (ou com um número velho) não apaga nada.
const Body = z.object({
  confirm: z.literal("APAGAR"),
  expected: z.number().int().min(0),
});

export const DELETE = handle(async (req) => {
  const user = await requireUser();
  const body = Body.parse(await req.json().catch(() => ({})));
  return json(await deleteAllTransactions(user.id, body.expected));
});
