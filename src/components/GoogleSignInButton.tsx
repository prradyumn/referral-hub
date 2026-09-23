"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POPUP = "cg-google-signin";
const SIZE = "width=500,height=640";

export default function GoogleSignInButton({
  next,
  fallbackAction,
}: {
  next: string;
  /** Full-page redirect, used when the popup is blocked. */
  fallbackAction: () => Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const win = useRef<Window | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopWatching = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Same-origin only: the popup and this page are both our own pages.
      if (e.origin !== window.location.origin) return;
      if (e.data !== "cg:signed-in") return;
      stopWatching();
      win.current?.close();
      // The session cookie is set now; ask the server for the signed-in view.
      router.replace(next);
      router.refresh();
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      stopWatching();
    };
  }, [router, next, stopWatching]);

  function open() {
    setBusy(true);

    const url = `/auth/popup?next=${encodeURIComponent(next)}`;
    const w = window.open(url, POPUP, SIZE);

    // Blocked, or the browser ignored the popup. Fall back to the full-page
    // redirect, which is the flow that has always worked.
    if (!w || w.closed) {
      void fallbackAction();
      return;
    }

    win.current = w;
    w.focus();

    // The popup may be closed by hand, or complete without reaching our
    // handler. Poll so the button does not stay stuck on "Opening…".
    timer.current = setInterval(() => {
      if (!w.closed) return;
      stopWatching();
      setBusy(false);
      // It may have succeeded and closed itself before the message landed.
      router.refresh();
    }, 500);
  }

  return (
    <button type="button" onClick={open} disabled={busy} className="btn-primary w-full gap-2.5">
      {/* Google's "G", on a white disc so it reads on the brand colour. */}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white" aria-hidden="true">
        <svg viewBox="0 0 48 48" className="h-4 w-4">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 2.9-2.2 5.4-4.7 7.1l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.5z" />
          <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
        </svg>
      </span>
      {busy ? "Waiting for Google…" : "Continue with Google"}
    </button>
  );
}
