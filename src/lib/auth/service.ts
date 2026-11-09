import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/jwt";
import { issueRefreshToken } from "@/lib/auth/tokens";
import { setAuthCookies } from "@/lib/auth/cookies";
import { seedDefaultsForUser } from "@/lib/categories/defaults";
import { env } from "@/lib/env";
import { badRequest, conflict, forbidden, unauthorized } from "@/lib/http";

// Hash de uma senha qualquer: login com email que não existe também paga um bcrypt, para
// o tempo de resposta não dizer quais emails têm conta.
const DUMMY_HASH = hashPassword("daily-money-dummy-password");

// Create user + default categories/members, then log them in (set cookies).
export async function registerUser(email: string, password: string, name?: string) {
  // App pessoal: o cadastro fica fechado depois do primeiro usuário, salvo ALLOW_REGISTRATION=true.
  if (!env.ALLOW_REGISTRATION && (await prisma.user.count()) > 0) {
    throw forbidden("Cadastro fechado neste servidor.");
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict("Já existe uma conta com esse email");

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, passwordHash, name: name ?? null } });
  // Default responsável = the logged-in person, by name (fallback: email prefix).
  const displayName = name?.trim() || email.split("@")[0];
  await seedDefaultsForUser(user.id, displayName);
  await establishSession(user.id, user.email);
  return { id: user.id, email: user.email };
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!user || !ok) throw unauthorized("Email ou senha incorretos");
  await establishSession(user.id, user.email);
  return { id: user.id, email: user.email };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw badRequest("Senha atual incorreta");
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  // Invalidate all refresh tokens after a password change.
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function establishSession(userId: string, email: string) {
  const accessToken = await signAccessToken({ sub: userId, email });
  const refreshToken = await issueRefreshToken(userId);
  setAuthCookies(accessToken, refreshToken);
}
