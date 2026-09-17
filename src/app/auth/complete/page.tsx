"use client";

import { useEffect } from "react";

/**
 * Where Google sends the popup once sign-in is done. Tells the page that opened
 * it to move on, then closes itself.
 *
 * If there is no opener the popup was blocked and this became a full-page
 * navigation, so finish the journey normally instead of closing a tab the user
 * is actually looking at.
 */
export default function AuthComplete() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("next");
    const next = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/home";

    if (window.opener && window.opener !== window) {
      window.opener.postMessage("cg:signed-in", window.location.origin);
      window.close();
      return;
    }

    window.location.replace(next);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <p className="text-[14px] text-[var(--color-ink-2)]">Signing you in…</p>
    </main>
  );
}
