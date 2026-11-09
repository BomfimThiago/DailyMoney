import { HttpError } from "@/lib/http";

// Limite de tentativas para login, cadastro e "esqueci a senha", na memória do processo
// (o app roda numa instância só). Sem ele, dá para testar senhas sem fim, e cada
// tentativa custa um bcrypt (CPU dividida com o resto do servidor).

interface Window {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __dailyMoneyAttempts?: Map<string, Window> };
const attempts: Map<string, Window> = (g.__dailyMoneyAttempts ??= new Map());

/** Quem está pedindo: o primeiro IP do X-Forwarded-For (o Caddy põe), senão "local". */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

function tooMany(key: string, max: number, now: number): void {
  const w = attempts.get(key);
  if (w && w.resetAt > now && w.count >= max) {
    const minutes = Math.max(1, Math.ceil((w.resetAt - now) / 60_000));
    throw new HttpError(429, `Muitas tentativas. Tente de novo em ${minutes} min.`, "TOO_MANY_ATTEMPTS");
  }
}

function count(key: string, windowMs: number, now: number): void {
  if (attempts.size > 10_000) {
    for (const [k, w] of attempts) if (w.resetAt <= now) attempts.delete(k);
  }
  const w = attempts.get(key);
  if (!w || w.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + windowMs });
  else w.count++;
}

/** Recusa com 429 (e diz em quantos minutos tentar) se alguma chave já gastou `max` na janela. */
export function assertAttemptsLeft(keys: string[], max: number): void {
  const now = Date.now();
  for (const key of keys) tooMany(key, max, now);
}

/** Conta uma tentativa (errada, no login) para cada chave. */
export function countAttempt(keys: string[], windowMs: number): void {
  const now = Date.now();
  for (const key of keys) count(key, windowMs, now);
}

/** Toda chamada conta (cadastro, "esqueci a senha"): recusa depois de `max` na janela. */
export function limitAttempts(keys: string[], max: number, windowMs: number): void {
  assertAttemptsLeft(keys, max);
  countAttempt(keys, windowMs);
}
