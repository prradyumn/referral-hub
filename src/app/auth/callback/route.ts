import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") ? rawNext : "/roles";

  const fail = (message: string) =>
    NextResponse.redirect(
      `${origin}/login?error_description=${encodeURIComponent(message)}`,
    );

  // Google (or Supabase) can bounce back with an error instead of a code —
  // a rejected domain, a cancelled consent screen, an expired link.
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) return fail(providerError);

  if (!code) return fail("That sign-in link is no longer valid. Try again.");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);

  return NextResponse.redirect(`${origin}${next}`);
}
