import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { handle, json, unauthorized } from "@/lib/http";
import { REFRESH_COOKIE, clearAuthCookies } from "@/lib/auth/cookies";
import { rotateRefreshToken } from "@/lib/auth/tokens";
import { establishSession } from "@/lib/auth/service";

// Rotate the refresh token and issue a fresh access token.
export const POST = handle(async () => {
  const token = cookies().get(REFRESH_COOKIE)?.value;
  if (!token) throw unauthorized();
  const userId = await rotateRefreshToken(token);
  if (!userId) {
    clearAuthCookies();
    throw unauthorized("Sessão expirada");
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    clearAuthCookies();
    throw unauthorized();
  }
  await establishSession(user.id, user.email);
  return json({ user: { id: user.id, email: user.email } });
});
