"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";

/**
 * Runs inside the popup window and nowhere else. Starting the OAuth redirect
 * here keeps Google's pages inside the popup, so the app behind it is never
 * navigated away from.
 */
export default function PopupSignIn() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("next");
    const next = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/home";

    void signIn("google", {
      callbackUrl: `/auth/complete?next=${encodeURIComponent(next)}`,
    });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <p className="text-[14px] text-[var(--color-ink-2)]">Opening Google…</p>
    </main>
  );
}
