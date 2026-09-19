import { NextResponse, type NextRequest } from "next/server";
import { cookieNames, isGateValid, readWho } from "@/lib/auth";

/*
 * Next 16 renamed the `middleware` file convention to `proxy` — same
 * runtime, same matcher semantics, different filename and export name.
 *
 * Two gates, in order:
 *   1. shared password  -> /login
 *   2. which of us is this -> /who
 *
 * Runs on the edge runtime, so everything it touches must be Web Crypto
 * rather than node:crypto (see lib/auth.ts).
 */
const PUBLIC_PATHS = ["/login"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const gated = await isGateValid(req.cookies.get(cookieNames.gate)?.value);

  if (!gated) {
    if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // Remember where they were headed so login can bounce them back.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Already past the password: no reason to show the login page again.
  if (PUBLIC_PATHS.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const who = await readWho(req.cookies.get(cookieNames.who)?.value);
  if (!who && pathname !== "/who") {
    const url = req.nextUrl.clone();
    url.pathname = "/who";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, the API routes that handle auth, and
  // static files (a poster image shouldn't cost two HMAC verifications).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
