import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

// Next 16 calls this the proxy; it used to be middleware. It runs on every
// matched request, refreshes the Supabase session cookie, and keeps signed-out
// visitors out of the app.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
