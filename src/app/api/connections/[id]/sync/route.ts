import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { syncConnection } from "@/lib/bank-sync/sync";

export const dynamic = "force-dynamic";

/** "Sincronizar agora": lê o que o serviço do banco já tem. */
export const POST = handle(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const result = await syncConnection(user.id, ctx.params.id);
  return json({ result });
});
