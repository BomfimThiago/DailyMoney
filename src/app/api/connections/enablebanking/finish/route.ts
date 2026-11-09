import { z } from "zod";
import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { finishBankAuthorization } from "@/lib/enablebanking/auth";

export const dynamic = "force-dynamic";

const body = z.object({
  code: z.string().min(1, "Retorno do banco sem código"),
  state: z.string().min(1, "Retorno do banco sem state"),
});

/** Volta do banco: grava a conexão com as contas que o usuário autorizou. */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const { code, state } = body.parse(await req.json());
  const result = await finishBankAuthorization(user.id, code, state);
  return json({ result }, { status: result.renewed ? 200 : 201 });
});
