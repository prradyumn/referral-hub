import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";

// Next 16 calls this the proxy; it used to be middleware. Auth.js keeps the
// session in a signed cookie, so there is no session to refresh here — this
// only gates routes. The employees row is handled in the app, not here, because
// this may run on the edge where pg is unavailable.
// /auth/popup and /auth/complete carry no data; they only run the popup
// handshake, and /auth/popup is loaded before there is a session.
// /api/cron is not public in any meaningful sense — it carries no session
// because it is called by Vercel Cron, and it authorises itself against
// CRON_SECRET. Without this entry the proxy would redirect the scheduler to
// /login and the sync would silently never run.
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/auth/popup",
  "/auth/complete",
  "/api/cron",
];

/**
 * The one hostname sign-in works on: the host of AUTH_URL.
 *
 * Vercel serves production on several hostnames — `referral-hub-pi`,
 * `referral-hub-prradyumns-projects`, `referral-hub-git-main-…` and a
 * per-deployment URL — and only one of them is registered with Google.
 * AUTH_URL pins the OAuth callback to that one (CONTEXT.md §8), but sign-in
 * *starts* on whichever host the person happens to be on, and that is where
 * Auth.js sets its PKCE cookie. Starting on `-pi` and finishing on
 * `-prradyumns-projects` means the callback cannot read the cookie:
 * `InvalidCheck: pkceCodeVerifier value could not be parsed`, which the login
 * page shows as "not configured correctly". The failure lands the person on
 * the canonical host, so their second attempt starts and finishes in one
 * place and works — which is why it only ever failed the first time.
 *
 * Moving everyone onto the canonical host before anything else runs is what
 * makes AUTH_URL coherent: one host for the callback, and the same host for
 * everything that leads up to it.
 *
 * Null when AUTH_URL is unset (local dev, preview deployments), which turns
 * the redirect off rather than guessing.
 */
function canonicalHost(): string | null {
  const raw = process.env.AUTH_URL;
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

function isLocal(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Before auth(), so a request on the wrong host costs nothing but the hop.
  const canonical = canonicalHost();
  const requested =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (
    canonical &&
    requested &&
    requested !== canonical &&
    !isLocal(requested) &&
    !isLocal(canonical) &&
    // Only navigations. A POST on the wrong host would already be broken, and
    // redirecting it would drop the body.
    (request.method === "GET" || request.method === "HEAD") &&
    // Server-to-server, authorised by CRON_SECRET; its host is irrelevant and
    // a scheduler that does not follow redirects would silently stop syncing.
    !pathname.startsWith("/api/cron")
  ) {
    const target = new URL(`${pathname}${request.nextUrl.search}`, `https://${canonical}`);
    return NextResponse.redirect(target, 308);
  }

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  const session = await auth();
  const signedIn = Boolean(session?.user);

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/roles";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
