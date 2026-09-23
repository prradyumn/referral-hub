"use client";

import { useToastResult } from "@/components/Toast";
import { useActionState, useState } from "react";
import { markAddedToKeka, unmarkAddedToKeka, type InboxState } from "./actions";

const initial: InboxState = { status: "idle" };

export function MarkAdded({ id, added }: { id: string; added: boolean }) {
  const [state, action, pending] = useActionState(added ? unmarkAddedToKeka : markAddedToKeka, initial);
  useToastResult(state);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="referralId" value={id} />
      <button type="submit" disabled={pending} className={added ? "btn-ghost !py-1.5 text-[13px]" : "btn-primary !py-1.5 text-[13px]"}>
        {pending ? "Saving…" : added ? "Undo" : "Mark added to Keka"}
      </button>
      {state.status === "error" && (
        <span className="text-[12px] text-[var(--color-danger)]">{state.message}</span>
      )}
    </form>
  );
}

/** One click to copy the candidate's details, ready to paste into Keka. */
export function CopyDetails({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1800);
        } catch {
          // Clipboard blocked; the details are on screen to copy by hand.
        }
      }}
      className="btn-ghost !py-1.5 text-[13px]"
    >
      {done ? "Copied ✓" : "Copy details"}
    </button>
  );
}
