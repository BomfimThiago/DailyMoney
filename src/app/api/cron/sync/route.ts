import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { HttpError, handle, json, unauthorized } from "@/lib/http";
import { syncAll } from "@/lib/bank-sync/sync";

export const dynamic = "force-dynamic";

function sameSecret(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(env.CRON_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rotina diária (contêiner `cron` do docker-compose): sincroniza todos os bancos
 * conectados. Fora do login (middleware), protegida pelo cabeçalho `x-cron-secret`.
 */
export const POST = handle(async (req) => {
  if (!env.CRON_SECRET) throw new HttpError(503, "CRON_SECRET não configurado", "CRON_DISABLED");
  if (!sameSecret(req.headers.get("x-cron-secret") ?? "")) throw unauthorized("Segredo da rotina inválido");
  const { results, failures } = await syncAll();
  const summary = results.flatMap((r) => r.accounts.map((a) => `${r.bank} · ${a.account}: ${a.status}`));
  return json({ ok: failures.length === 0, summary, failures }, { status: failures.length ? 207 : 200 });
});
