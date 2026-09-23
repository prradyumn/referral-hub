"use client";

import { useToastResult } from "@/components/Toast";
import { useActionState } from "react";
import { setDepartmentReward, type RewardState } from "./actions";

const initial: RewardState = { status: "idle" };

/**
 * Set one figure across a whole department in a single action.
 *
 * With 56 open roles arriving from Keka with no reward, setting them one at a
 * time is the difference between this being usable today and a job nobody
 * gets round to. Only touches roles that have no confirmed reward yet, so it
 * can never overwrite a figure somebody already decided on.
 */
export default function DepartmentBulk({ departments }: { departments: string[] }) {
  const [state, action, pending] = useActionState(setDepartmentReward, initial);
  useToastResult(state);

  return (
    <form action={action} className="card mb-4 flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-[200px] flex-1">
        <label htmlFor="bulk-dept" className="label">
          Set a reward across a department
        </label>
        <select id="bulk-dept" name="department" className="field" defaultValue="">
          <option value="">Choose a department</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="w-[150px]">
        <label htmlFor="bulk-reward" className="label">Reward ₹</label>
        <input
          id="bulk-reward"
          name="reward"
          type="number"
          min={0}
          step={500}
          placeholder="e.g. 15000"
          className="field"
        />
      </div>

      <button type="submit" disabled={pending} className="btn-ghost mb-0.5">
        {pending ? "Applying…" : "Apply to unset roles"}
      </button>

      <p aria-live="polite" className="w-full text-[12.5px] text-[var(--color-ink-3)]">
        {state.message ?? "Only affects roles in that department with no reward set yet."}
      </p>
    </form>
  );
}
