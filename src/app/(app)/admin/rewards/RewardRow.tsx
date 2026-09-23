"use client";

import { useActionState } from "react";
import { setReward, setBand, type RewardState } from "./actions";
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
  track: string | null;
  band: string | null;
  band_source: string | null;
  reward_origin: string;
};

export type BandOption = { value: string; label: string; disabled: boolean };

/** Where this role's reward came from, in words HR will recognise. */
function provenance(job: Job): { text: string; tone: "ok" | "review" | "hold" | "custom" } {
  const where = job.band
    ? `${job.band} · ${job.track === "engineering" ? "Engineering" : "Non-Engineering"}`
    : "No band";
  if (job.reward_origin === "custom") return { text: "Custom figure set by HR", tone: "custom" };
  if (job.band_source === "hr") return { text: `${where} · chosen by HR`, tone: "ok" };
  if (job.band_source === "title" && job.reward_confirmed)
    return { text: `${where} · matched from the title`, tone: "ok" };
  if (job.band_source === "title") return { text: `${where} · band amount needs clarifying`, tone: "hold" };
  if (job.band_source === "experience" && job.reward_confirmed)
    return { text: `${where} · from experience — change if wrong`, tone: "review" };
  if (job.band_source === "experience")
    return { text: `${where} · suggested from experience — please confirm`, tone: "review" };
  return { text: where, tone: "review" };
}

const initial: RewardState = { status: "idle" };

export default function RewardRow({ job, bands }: { job: Job; bands: BandOption[] }) {
  const [state, action, pending] = useActionState(setReward, initial);
  const [bandState, bandAction, bandPending] = useActionState(setBand, initial);
  const p = provenance(job);
  const tone = {
    ok: "bg-[var(--color-good-soft,#e7f6ec)] text-[var(--color-good)]",
    review: "bg-[var(--color-gold-soft)] text-[var(--color-gold)]",
    hold: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
    custom: "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
  }[p.tone];

  return (
    // min-w-0: rows sit in a grid, whose items otherwise grow to their widest
    // content — the band dropdown's longest option — and push every row off
    // the edge of a phone.
    <div className="card min-w-0 p-4">
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="jobId" value={job.id} />

      <div className="min-w-0 flex-1 basis-full sm:basis-[240px]">
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

    {/* A second form, because forms cannot nest: put the role in a band and
        it takes that band's reward from HR's table. */}
    <form
      action={bandAction}
      className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-3"
    >
      <input type="hidden" name="jobId" value={job.id} />
      <span className={`pill ${tone} max-w-full whitespace-normal`}>{p.text}</span>
      <label htmlFor={`band-${job.id}`} className="sr-only">
        Band
      </label>
      <select
        id={`band-${job.id}`}
        name="choice"
        defaultValue={job.band && job.track ? `${job.track}:${job.band}` : ""}
        className="field min-w-0 max-w-full flex-1 basis-[200px] !py-1.5 text-[13px] sm:!w-auto sm:flex-none"
      >
        <option value="" disabled>
          Choose a band
        </option>
        {bands.map((b) => (
          <option key={b.value} value={b.value} disabled={b.disabled}>
            {b.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={bandPending} className="btn-ghost !py-1.5 text-[13px]">
        {bandPending ? "Applying…" : job.band_source === "experience" && !job.reward_confirmed ? "Confirm band" : "Apply band"}
      </button>
      {bandState.message && (
        <span
          aria-live="polite"
          className={`text-[12px] ${
            bandState.status === "error" ? "text-[var(--color-danger)]" : "text-[var(--color-good)]"
          }`}
        >
          {bandState.message}
        </span>
      )}
    </form>
    </div>
  );
}
