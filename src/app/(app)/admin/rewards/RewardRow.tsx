"use client";

import { useActionState } from "react";
import { setReward, type RewardState } from "./actions";
import { rupees } from "@/lib/format";

type Job = {
  id: string;
  req_id: string;
  title: string;
  department: string;
  location: string;
  reward_amount: number;
  eligibility_days: number;
  is_priority: boolean;
  reward_confirmed: boolean;
  referral_count: number;
};

const initial: RewardState = { status: "idle" };

export default function RewardRow({ job }: { job: Job }) {
  const [state, action, pending] = useActionState(setReward, initial);

  return (
    <form action={action} className="card flex flex-wrap items-end gap-3 p-4">
      <input type="hidden" name="jobId" value={job.id} />

      <div className="min-w-[240px] flex-1">
        <p className="text-[14.5px] font-semibold leading-snug">{job.title}</p>
        <p className="text-[12.5px] text-[var(--color-ink-3)]">
          {job.department} · {job.location} · {job.req_id}
          {job.referral_count > 0 && ` · ${job.referral_count} referral(s)`}
        </p>
      </div>

      {!job.reward_confirmed && (
        <span className="pill bg-[var(--color-gold-soft)] text-[var(--color-gold)]">
          Not set
        </span>
      )}

      <div className="w-[130px]">
        <label htmlFor={`reward-${job.id}`} className="label">Reward ₹</label>
        <input
          id={`reward-${job.id}`}
          name="reward"
          type="number"
          min={0}
          step={500}
          defaultValue={job.reward_confirmed ? job.reward_amount : ""}
          placeholder="e.g. 15000"
          className="field"
        />
      </div>

      <div className="w-[110px]">
        <label htmlFor={`days-${job.id}`} className="label">Eligible after</label>
        <input
          id={`days-${job.id}`}
          name="eligibilityDays"
          type="number"
          min={0}
          max={365}
          defaultValue={job.eligibility_days}
          className="field"
        />
      </div>

      <label className="flex items-center gap-2 pb-2.5 text-[13px] text-[var(--color-ink-2)]">
        <input
          type="checkbox"
          name="priority"
          defaultChecked={job.is_priority}
          className="h-4 w-4 accent-[var(--color-brand)]"
        />
        Priority
      </label>

      <button type="submit" disabled={pending} className="btn-primary mb-0.5">
        {pending ? "Saving…" : "Save"}
      </button>

      <p
        aria-live="polite"
        className={`w-full text-[12.5px] ${
          state.status === "error"
            ? "text-[var(--color-bad,#b42318)]"
            : "text-[var(--color-ink-3)]"
        }`}
      >
        {state.status === "ok"
          ? `Saved — employees now see ${rupees(job.reward_amount)} on this role.`
          : state.message ?? ""}
      </p>
    </form>
  );
}
