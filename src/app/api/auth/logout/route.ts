import { cookies } from "next/headers";
import { handle, json } from "@/lib/http";
import { REFRESH_COOKIE, clearAuthCookies } from "@/lib/auth/cookies";
import { revokeRefreshToken } from "@/lib/auth/tokens";

export const POST = handle(async () => {
  const token = cookies().get(REFRESH_COOKIE)?.value;
  if (token) await revokeRefreshToken(token);
  clearAuthCookies();
  return json({ ok: true });
});
