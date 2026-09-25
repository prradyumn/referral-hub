"use client";

import { useActionState } from "react";
import { useToastResult } from "@/components/Toast";
import {
  creditKekaReferral,
  dismissKekaReferral,
  type KekaReferralState,
} from "./actions";

const initial: KekaReferralState = { status: "idle" };

/** Pre-filled with the suggestion when there is one. The admin still presses Credit. */
export function CreditForm({ rowId, suggested }: { rowId: string; suggested: string | null }) {
  const [state, action, pending] = useActionState(creditKekaReferral, initial);
  useToastResult(state);
  return (
    <form action={action} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <input type="hidden" name="rowId" value={rowId} />
      <label className="sr-only" htmlFor={`referrer-${rowId}`}>
        Referrer&apos;s work email
      </label>
      <input
        id={`referrer-${rowId}`}
        name="referrerEmail"
        type="email"
        defaultValue={suggested ?? ""}
        placeholder="referrer@convegenius.ai"
        className="field !py-1.5 min-w-[220px] flex-1 text-[13.5px]"
      />
      <button type="submit" disabled={pending} className="btn-primary !py-1.5 text-[13px]">
        {pending ? "Crediting…" : "Credit referral"}
      </button>
      {state.status === "error" && (
        <span className="w-full text-[12px] text-[var(--color-danger)]">{state.message}</span>
      )}
    </form>
  );
}

export function DismissButton({ rowId }: { rowId: string }) {
  const [state, action, pending] = useActionState(dismissKekaReferral, initial);
  useToastResult(state);
  return (
    <form action={action}>
      <input type="hidden" name="rowId" value={rowId} />
      <button type="submit" disabled={pending} className="btn-ghost !py-1.5 text-[13px]">
        {pending ? "Saving…" : "Not a referral"}
      </button>
    </form>
  );
}
