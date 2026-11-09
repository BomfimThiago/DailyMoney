import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { unauthorized } from "@/lib/http";

export interface SessionUser {
  id: string;
  email: string;
}

// Returns the authenticated user or null. Reads the access-token cookie.
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  return { id: claims.sub, email: claims.email };
}

// Use inside protected route handlers — throws 401 if not logged in.
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}
