import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";

// Public pages/endpoints that don't require a session.
const PUBLIC_PATHS = ["/login", "/register", "/forgot", "/reset"];
// /api/cron/: chamada pela rotina do servidor, sem sessão; a rota exige o segredo próprio.
const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/cron/"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Pedido que muda dados vindo de outro site: recusado. O cookie é SameSite=Lax, mas no
 * sslip.io qualquer "<ip>.sslip.io" conta como o mesmo site, e um formulário text/plain
 * consegue imitar JSON. O navegador sempre diz de onde veio (Sec-Fetch-Site, Origin);
 * chamadas sem navegador (rotina diária, scripts) não mandam nenhum dos dois.
 */
function fromOtherSite(req: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return false;
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true; // Origin "null" (iframe isolado, arquivo local)
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/") && fromOtherSite(req)) {
    return NextResponse.json(
      { error: { message: "Pedido de outro site recusado", code: "FORBIDDEN_ORIGIN" } },
      { status: 403 },
    );
  }
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  const claims = token ? await verifyAccessToken(token) : null;

  // Signed-in users hitting an auth page go to the dashboard.
  if (claims && PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (isPublic(pathname)) return NextResponse.next();

  if (!claims) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: { message: "Não autenticado", code: "UNAUTHORIZED" } }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    // Com a busca: a volta do banco (/connections/callback?code=…) precisa dela depois do login.
    url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Run on everything except static assets and Next internals.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)"],
};
