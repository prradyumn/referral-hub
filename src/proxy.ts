import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";

// Next 16 calls this the proxy; it used to be middleware. Auth.js keeps the
// session in a signed cookie, so there is no session to refresh here — this
// only gates routes. The employees row is handled in the app, not here, because
// this may run on the edge where pg is unavailable.
const PUBLIC_PREFIXES = ["/login", "/api/auth"];

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
