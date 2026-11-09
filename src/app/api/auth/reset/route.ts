import { prisma } from "@/lib/prisma";
import { handle, json, badRequest } from "@/lib/http";
import { resetSchema } from "@/lib/auth/schemas";
import { consumeResetToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";

export const POST = handle(async (req) => {
  const { token, password } = resetSchema.parse(await req.json());
  const userId = await consumeResetToken(token);
  if (!userId) throw badRequest("Token inválido ou expirado");
  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  // Kill existing sessions after a reset.
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return json({ ok: true });
});
