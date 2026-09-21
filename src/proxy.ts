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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
