"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small confirmation in the corner after an admin action.
 *
 * Inline messages were not enough: marking a referral "added to Keka" moves
 * it to the other tab, so the row — and its message — vanished at the moment
 * the action succeeded, and it looked like nothing had happened. The toaster
 * lives in the layout, outside anything an action can unmount.
 *
 * `toast()` is a window event rather than context so any client component can
 * call it without a provider around it.
 */

type Kind = "ok" | "error";
type Item = { id: number; message: string; kind: Kind };

const EVENT = "cg:toast";

export function toast(message: string, kind: Kind = "ok") {
  window.dispatchEvent(new CustomEvent<Omit<Item, "id">>(EVENT, { detail: { message, kind } }));
}

/**
 * Toast each new result of a useActionState action. The state object is new
 * on every submission, so the same message twice still shows twice.
 */
export function useToastResult(state: { status: string; message?: string }, prefix?: string) {
  const last = useRef(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.message && (state.status === "ok" || state.status === "error")) {
      toast(prefix ? `${prefix}: ${state.message}` : state.message, state.status);
    }
  }, [state, prefix]);
}

let seq = 0;

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const { message, kind } = (e as CustomEvent<Omit<Item, "id">>).detail;
      const id = ++seq;
      setItems((xs) => [...xs.slice(-2), { id, message, kind }]);
      window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
    }
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={`toast-in pointer-events-auto flex max-w-[380px] items-start gap-2.5 rounded-lg px-4 py-3 text-[13.5px] leading-snug text-white shadow-[0_12px_32px_-10px_rgba(23,27,36,.45)] ${
            t.kind === "error" ? "bg-[var(--color-danger)]" : "bg-[#1d2233]"
          }`}
        >
          <span aria-hidden="true" className={t.kind === "error" ? "" : "text-[#7fe0b8]"}>
            {t.kind === "error" ? "!" : "✓"}
          </span>
          <span>{t.message}</span>
          <button
            type="button"
            onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
            className="-mr-1 ml-1 text-white/60 hover:text-white"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
