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
    <button type="button" onClick={open} disabled={busy} className="btn-primary w-full">
      {busy ? "Waiting for Google…" : "Continue with Google"}
    </button>
  );
}
