import { handle, json } from "@/lib/http";
import { registerSchema } from "@/lib/auth/schemas";
import { registerUser } from "@/lib/auth/service";
import { clientIp, limitAttempts } from "@/lib/auth/rate-limit";

export const POST = handle(async (req) => {
  limitAttempts([`register:ip:${clientIp(req)}`], 5, 60 * 60_000);
  const body = registerSchema.parse(await req.json());
  const user = await registerUser(body.email, body.password, body.name);
  return json({ user }, { status: 201 });
});
