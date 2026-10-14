"use client";

import { useActionState } from "react";
import { useToastResult } from "@/components/Toast";
import { syncNow, type SyncNowState } from "./sync/actions";

const initial: SyncNowState = { status: "idle" };

/**
 * Runs the nightly Keka sync now. A full run takes two to three minutes —
 * Keka allows 50 calls a minute and every open role costs two — so the button
 * says so rather than looking stuck.
 */
export default function SyncNowButton() {
  const [state, action, pending] = useActionState(syncNow, initial);
  useToastResult(state);

  return (
    <form action={action} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="submit" disabled={pending} className="btn-primary !py-1.5 text-[13px]">
        {pending ? "Syncing with Keka…" : "Sync with Keka now"}
      </button>
      <span className="text-[12.5px] text-[var(--color-ink-3)]" aria-live="polite">
        {pending
          ? "Takes 2–3 minutes. Keep this page open."
          : state.message ?? "Runs automatically every day at 08:00 IST."}
      </span>
    </form>
  );
}
