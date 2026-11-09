import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { ttlToSeconds } from "@/lib/auth/jwt";
import { generateOpaqueToken, hashToken } from "@/lib/auth/password";

// --- Refresh tokens ---------------------------------------------------------

export async function issueRefreshToken(userId: string): Promise<string> {
  const { token, tokenHash } = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + ttlToSeconds(env.REFRESH_TOKEN_TTL) * 1000);
  await prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  return token;
}

// Validate + rotate (single-use). Returns userId or null if invalid/expired.
export async function rotateRefreshToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!record || record.revokedAt || record.expiresAt < new Date()) return null;
  // Só quem revoga primeiro leva: dois pedidos de renovação ao mesmo tempo com o mesmo
  // token não ganham duas sessões.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: record.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count === 1 ? record.userId : null;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await prisma.refreshToken.update({ where: { tokenHash }, data: { revokedAt: new Date() } }).catch(() => undefined);
}

// --- Password reset tokens ---------------------------------------------------

const RESET_TTL_SECONDS = 60 * 60; // 1h

export async function issueResetToken(userId: string): Promise<string> {
  const { token, tokenHash } = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_SECONDS * 1000);
  await prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
  return token;
}

export async function consumeResetToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) return null;
  const { count } = await prisma.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1 ? record.userId : null;
}
