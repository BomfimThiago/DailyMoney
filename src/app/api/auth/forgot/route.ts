import { prisma } from "@/lib/prisma";
import { handle, json } from "@/lib/http";
import { forgotSchema } from "@/lib/auth/schemas";
import { issueResetToken } from "@/lib/auth/tokens";
import { sendPasswordResetEmail } from "@/lib/auth/mail";
import { clientIp, limitAttempts } from "@/lib/auth/rate-limit";

// Always returns ok (no user enumeration). In dev the reset link is logged.
export const POST = handle(async (req) => {
  const { email } = forgotSchema.parse(await req.json());
  limitAttempts([`forgot:ip:${clientIp(req)}`, `forgot:email:${email.toLowerCase()}`], 5, 60 * 60_000);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await issueResetToken(user.id);
    await sendPasswordResetEmail(email, token);
  }
  return json({ ok: true });
});
