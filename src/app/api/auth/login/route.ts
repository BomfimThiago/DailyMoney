import { HttpError, handle, json } from "@/lib/http";
import { loginSchema } from "@/lib/auth/schemas";
import { loginUser } from "@/lib/auth/service";
import { assertAttemptsLeft, clientIp, countAttempt } from "@/lib/auth/rate-limit";

const MAX_FAILURES = 10;
const WINDOW = 15 * 60_000;

// Só senha errada conta: 10 por email e por IP a cada 15 min.
export const POST = handle(async (req) => {
  const body = loginSchema.parse(await req.json());
  const keys = [`login:email:${body.email.toLowerCase()}`, `login:ip:${clientIp(req)}`];
  assertAttemptsLeft(keys, MAX_FAILURES);
  try {
    const user = await loginUser(body.email, body.password);
    return json({ user });
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) countAttempt(keys, WINDOW);
    throw err;
  }
});
