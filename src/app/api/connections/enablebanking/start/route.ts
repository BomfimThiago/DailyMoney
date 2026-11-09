import { z } from "zod";
import { env } from "@/lib/env";
import { handle, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { startBankAuthorization } from "@/lib/enablebanking/auth";

export const dynamic = "force-dynamic";

const body = z.union([
  z.object({
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Escolha o país"),
    bank: z.string().trim().min(1, "Escolha o banco"),
    syncFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD")
      .optional(),
  }),
  z.object({ connectionId: z.string().min(1) }),
]);

/** Para onde o banco devolve: o configurado, ou /connections/callback neste endereço. */
function redirectUrl(req: Request): string {
  if (env.ENABLE_BANKING_REDIRECT_URL) return env.ENABLE_BANKING_REDIRECT_URL;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}/connections/callback`;
}

/**
 * Começa a autorização num banco europeu (nova conexão ou "Autorizar de novo"). Devolve o
 * endereço do banco; a tela leva o usuário até lá e ele volta em /connections/callback.
 */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const v = body.parse(await req.json());
  const { url } = await startBankAuthorization(
    user.id,
    "connectionId" in v ? { country: "", bank: "", connectionId: v.connectionId } : v,
    redirectUrl(req),
  );
  return json({ url });
});
