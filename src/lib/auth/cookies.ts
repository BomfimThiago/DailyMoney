import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { ttlToSeconds } from "@/lib/auth/jwt";

export const ACCESS_COOKIE = "dm_access";
export const REFRESH_COOKIE = "dm_refresh";

const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function setAuthCookies(accessToken: string, refreshToken: string) {
  const jar = cookies();
  jar.set(ACCESS_COOKIE, accessToken, {
    ...baseCookie,
    maxAge: ttlToSeconds(env.ACCESS_TOKEN_TTL),
  });
  jar.set(REFRESH_COOKIE, refreshToken, {
    ...baseCookie,
    maxAge: ttlToSeconds(env.REFRESH_TOKEN_TTL),
  });
}

export function clearAuthCookies() {
  const jar = cookies();
  jar.set(ACCESS_COOKIE, "", { ...baseCookie, maxAge: 0 });
  jar.set(REFRESH_COOKIE, "", { ...baseCookie, maxAge: 0 });
}
