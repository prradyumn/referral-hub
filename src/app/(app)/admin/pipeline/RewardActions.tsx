"use client";

import { useToastResult } from "@/components/Toast";
import { useActionState } from "react";
import { approveReward, markPaid, type PipelineState } from "./actions";

const initial: PipelineState = { status: "idle" };

export function ApproveButton({ rewardId }: { rewardId: string }) {
  const [state, action, pending] = useActionState(approveReward, initial);
  useToastResult(state);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="rewardId" value={rewardId} />
      <button type="submit" disabled={pending} className="btn-primary !py-1.5 text-[13px]">
        {pending ? "Approving…" : "Approve"}
      </button>
      {state.message && (
        <span
          aria-live="polite"
          className={`text-[12px] ${
            state.status === "error" ? "text-[var(--color-bad,#b42318)]" : "text-[var(--color-ink-3)]"
          }`}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}

export function MarkPaidForm({ rewardId }: { rewardId: string }) {
  const [state, action, pending] = useActionState(markPaid, initial);
  useToastResult(state);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="rewardId" value={rewardId} />
      <label className="sr-only" htmlFor={`ref-${rewardId}`}>
        Payroll reference
      </label>
      <input
        id={`ref-${rewardId}`}
        name="reference"
        placeholder="Payroll month or reference"
        className="field !w-[190px] !py-1.5 text-[13px]"
      />
      <button type="submit" disabled={pending} className="btn-ghost !py-1.5 text-[13px]">
        {pending ? "Saving…" : "Mark paid"}
      </button>
      {state.message && (
        <span
          aria-live="polite"
          className={`text-[12px] ${
            state.status === "error" ? "text-[var(--color-bad,#b42318)]" : "text-[var(--color-ink-3)]"
          }`}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
