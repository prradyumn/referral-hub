"use client";

import { useToastResult } from "@/components/Toast";
import { useActionState } from "react";
import { setBandAmount, confirmSuggestedBands, type RewardState } from "./actions";

export type BandRow = {
  track: "engineering" | "non_engineering";
  band: string;
  designation: string;
  amount: number;
  amount_label: string | null;
  needs_clarification: boolean;
  roles: number;
};

const initial: RewardState = { status: "idle" };

function Row({ r }: { r: BandRow }) {
  const [state, action, pending] = useActionState(setBandAmount, initial);
  useToastResult(state);
  return (
    <form
      action={action}
      className={`flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-3 py-2 last:border-b-0 ${
        r.needs_clarification ? "bg-[var(--color-danger-soft)]" : ""
      }`}
    >
      <input type="hidden" name="track" value={r.track} />
      <input type="hidden" name="band" value={r.band} />
      <span className="w-10 shrink-0 text-[13px] font-semibold">{r.band}</span>
      <span className="min-w-0 flex-1 basis-[140px] text-[13px] text-[var(--color-ink-2)]">
        {r.designation}
        <span className="ml-1.5 text-[12px] text-[var(--color-ink-3)]">
          · {r.roles} open role{r.roles === 1 ? "" : "s"}
        </span>
      </span>
      <label className="sr-only" htmlFor={`amt-${r.track}-${r.band}`}>
        Reward for {r.band}
      </label>
      <input
        id={`amt-${r.track}-${r.band}`}
        name="amount"
        type="number"
        min={0}
        step={500}
        defaultValue={r.amount}
        className="field !w-[120px] !py-1.5 text-[13px] tabular-nums"
      />
      <input
        name="label"
        defaultValue={r.amount_label ?? ""}
        placeholder="Label (optional)"
        aria-label={`How ${r.band} is written`}
        className="field !w-[140px] !py-1.5 text-[13px]"
      />
      <button type="submit" disabled={pending} className="btn-ghost !py-1.5 text-[13px]">
        {pending ? "Saving…" : r.needs_clarification ? "Confirm" : "Save"}
      </button>
      {r.needs_clarification && (
        <p className="w-full text-[12px] text-[var(--color-danger)]">
          Written as “{r.amount_label}”. Is that a split payment, or a figure per designation?
          Roles in this band show “To be confirmed” until you save a single amount.
        </p>
      )}
      {state.message && (
        <p
          aria-live="polite"
          className={`w-full text-[12px] ${
            state.status === "error" ? "text-[var(--color-danger)]" : "text-[var(--color-good)]"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

/** HR's band table, editable, with the roles each row prices. */
export default function BandTable({ rows }: { rows: BandRow[] }) {
  const groups: [string, BandRow[]][] = [
    ["Engineering", rows.filter((r) => r.track === "engineering")],
    ["Non-Engineering", rows.filter((r) => r.track === "non_engineering")],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map(([name, list]) => (
        <div key={name} className="card overflow-hidden">
          <p className="border-b border-[var(--color-line)] bg-[var(--color-ground)] px-3 py-2 text-[12px] font-semibold tracking-[0.08em] text-[var(--color-ink-3)] uppercase">
            {name}
          </p>
          {list.map((r) => (
            <Row key={`${r.track}-${r.band}`} r={r} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ConfirmSuggested({ count }: { count: number }) {
  const [state, action, pending] = useActionState(async () => confirmSuggestedBands(), initial);
  useToastResult(state);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={pending || count === 0} className="btn-primary">
        {pending ? "Confirming…" : `Confirm all ${count} suggested bands`}
      </button>
      {state.message && (
        <span aria-live="polite" className="text-[13px] text-[var(--color-good)]">
          {state.message}
        </span>
      )}
    </form>
  );
}
