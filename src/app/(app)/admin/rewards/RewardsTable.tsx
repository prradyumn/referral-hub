"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { setReward, setBand, type RewardState } from "./actions";
import { useToastResult } from "@/components/Toast";
import { rupees } from "@/lib/format";

export type Job = {
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

type Tone = "ok" | "review" | "hold" | "custom";

/** Where this role's reward came from, in words HR will recognise. */
function provenance(job: Job): { text: string; tone: Tone } {
  if (job.reward_origin === "custom") return { text: "Custom figure", tone: "custom" };
  if (job.band_source === "hr") return { text: "Chosen by HR", tone: "ok" };
  if (job.band_source === "title" && job.reward_confirmed) return { text: "From title", tone: "ok" };
  if (job.band_source === "title") return { text: "Band amount unclear", tone: "hold" };
  if (job.band_source === "experience" && job.reward_confirmed)
    return { text: "From experience — check", tone: "review" };
  if (job.band_source === "experience") return { text: "Suggested — confirm", tone: "review" };
  return { text: "No band", tone: "hold" };
}

const TONE: Record<Tone, string> = {
  ok: "bg-[var(--color-good-soft)] text-[var(--color-good)]",
  review: "bg-[var(--color-gold-soft)] text-[var(--color-gold)]",
  hold: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  custom: "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
};

type Show = "" | "review" | "pending" | "confirmed";
type SortKey = "title" | "band" | "reward" | "referrals";

const BAND_ORDER = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8+"];

/**
 * Every open role on one screen: find it, sort it, change it where it sits.
 *
 * It was a stack of 56 cards, each with two forms, about 180px tall — HR had
 * to scroll a long page and use the browser's find to reach one role. As a
 * table it fits a laptop screen at a time, the search is instant because the
 * rows are already here, and a change is made in the row itself.
 */
export default function RewardsTable({
  jobs,
  bands,
  initialDept = "",
  initialShow = "",
}: {
  jobs: Job[];
  bands: BandOption[];
  initialDept?: string;
  initialShow?: string;
}) {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState(initialDept);
  const [show, setShow] = useState<Show>(
    (["", "review", "pending", "confirmed"] as const).includes(initialShow as Show) ? (initialShow as Show) : "",
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "reward", dir: -1 });

  const departments = useMemo(() => [...new Set(jobs.map((j) => j.department))].sort(), [jobs]);

  const counts = useMemo(
    () => ({
      "": jobs.length,
      review: jobs.filter((j) => j.band_source === "experience").length,
      pending: jobs.filter((j) => !j.reward_confirmed).length,
      confirmed: jobs.filter((j) => j.reward_confirmed).length,
    }),
    [jobs],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = jobs.filter((j) => {
      if (dept && j.department !== dept) return false;
      if (show === "pending" && j.reward_confirmed) return false;
      if (show === "review" && j.band_source !== "experience") return false;
      if (show === "confirmed" && !j.reward_confirmed) return false;
      if (needle && ![j.title, j.department, j.location, j.req_id].join(" ").toLowerCase().includes(needle))
        return false;
      return true;
    });
    const val = (j: Job): string | number => {
      switch (sort.key) {
        case "title":
          return j.title.toLowerCase();
        case "band":
          return j.band ? BAND_ORDER.indexOf(j.band) : -1;
        case "reward":
          return j.reward_confirmed ? j.reward_amount : -1;
        case "referrals":
          return j.referral_count;
      }
    };
    return rows.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : a.title.localeCompare(b.title)) * sort.dir;
    });
  }, [jobs, q, dept, show, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "title" ? 1 : -1 }));
  }

  const SHOWS: [Show, string][] = [
    ["", "All"],
    ["review", "From experience"],
    ["pending", "Needs a reward"],
    ["confirmed", "Confirmed"],
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <label htmlFor="role-search" className="sr-only">
          Search roles
        </label>
        <input
          id="role-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, team, city or req ID"
          className="field min-w-0 flex-1 basis-[240px] sm:!max-w-[340px]"
        />
        <label htmlFor="dept" className="sr-only">
          Department
        </label>
        <select id="dept" value={dept} onChange={(e) => setDept(e.target.value)} className="field !w-auto">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Show">
        {SHOWS.map(([v, label]) => (
          <button
            key={v || "all"}
            type="button"
            aria-pressed={show === v}
            onClick={() => setShow(v)}
            className={`rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 transition ${
              show === v
                ? "bg-[var(--color-brand)] text-white ring-[var(--color-brand)]"
                : "bg-white text-[var(--color-ink-2)] ring-[var(--color-line)] hover:ring-[var(--color-ink-3)]"
            }`}
          >
            {label} <span className="tabular-nums opacity-70">{counts[v]}</span>
          </button>
        ))}
      </div>

      <p className="mb-2 text-[12.5px] text-[var(--color-ink-3)]" aria-live="polite">
        {shown.length} of {jobs.length} open roles
      </p>

      {/* Scrolls inside its own box on a phone rather than widening the page.
          `relative` matters: the cells' sr-only labels are absolutely
          positioned, and without a positioned ancestor they escape the
          scroller and widen the whole document. */}
      <div className="card relative overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-left text-[13.5px]">
          <thead className="bg-[var(--color-ground)] text-[12px] text-[var(--color-ink-3)]">
            <tr>
              <SortTh label="Role" k="title" sort={sort} onSort={toggleSort} />
              <SortTh label="Band" k="band" sort={sort} onSort={toggleSort} />
              <SortTh label="Cash ₹" k="reward" sort={sort} onSort={toggleSort} />
              <th scope="col" className="px-3 py-2.5 font-medium">Days</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Priority</th>
              <SortTh label="Refs" k="referrals" sort={sort} onSort={toggleSort} />
              <th scope="col" className="px-3 py-2.5 font-medium">
                <span className="sr-only">Save</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((job) => (
              // Keyed on the values too, so a saved row resets to what the
              // server now holds instead of keeping stale edits.
              <Row
                key={`${job.id}:${job.reward_amount}:${job.eligibility_days}:${job.is_priority}:${job.band}:${job.reward_confirmed}`}
                job={job}
                bands={bands}
              />
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="p-10 text-center text-[14px] text-[var(--color-ink-3)]">No roles match.</p>
        )}
      </div>
    </div>
  );
}

function SortTh({
  label,
  k,
  sort,
  onSort,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
}) {
  const on = sort.key === k;
  return (
    <th
      scope="col"
      className="px-3 py-2.5 font-medium"
      aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-[var(--color-ink)] ${on ? "text-[var(--color-ink)]" : ""}`}
      >
        {label}
        <span aria-hidden="true" className={on ? "" : "opacity-30"}>
          {on && sort.dir === 1 ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}

const initial: RewardState = { status: "idle" };

function Row({ job, bands }: { job: Job; bands: BandOption[] }) {
  const [state, action, pending] = useActionState(setReward, initial);
  const [bandState, bandAction, bandPending] = useActionState(setBand, initial);
  useToastResult(state, job.title);
  useToastResult(bandState, job.title);

  const start = {
    reward: job.reward_confirmed ? String(job.reward_amount) : "",
    days: String(job.eligibility_days),
    priority: job.is_priority,
  };
  const [reward, setRewardValue] = useState(start.reward);
  const [days, setDays] = useState(start.days);
  const [priority, setPriority] = useState(start.priority);
  const dirty = reward !== start.reward || days !== start.days || priority !== start.priority;
  const bandForm = useRef<HTMLFormElement>(null);

  const f = `rw-${job.id}`;
  const p = provenance(job);

  return (
    <tr className={`border-t border-[var(--color-line)] align-middle ${dirty ? "bg-[var(--color-gold-soft)]/50" : ""}`}>
      <td className="max-w-[300px] px-3 py-2.5">
        <p className="leading-snug font-semibold">{job.title}</p>
        <p className="truncate text-[12px] text-[var(--color-ink-3)]" title={`${job.department} · ${job.location} · ${job.req_id}`}>
          {job.department} · {job.location} · {job.req_id}
        </p>
      </td>

      <td className="px-3 py-2.5">
        <form ref={bandForm} action={bandAction}>
          <input type="hidden" name="jobId" value={job.id} />
          <label htmlFor={`band-${job.id}`} className="sr-only">
            Band for {job.title}
          </label>
          {/* Choosing a band applies it — the band table decides the cash. */}
          <select
            id={`band-${job.id}`}
            name="choice"
            defaultValue={job.band && job.track ? `${job.track}:${job.band}` : ""}
            disabled={bandPending}
            onChange={() => bandForm.current?.requestSubmit()}
            className="field !w-[178px] !py-1 text-[12.5px]"
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
        </form>
        <span className={`pill mt-1 ${TONE[p.tone]} !text-[10.5px]`}>{bandPending ? "Applying…" : p.text}</span>
      </td>

      <td className="px-3 py-2.5">
        <label htmlFor={`reward-${job.id}`} className="sr-only">
          Cash reward for {job.title}
        </label>
        <input
          id={`reward-${job.id}`}
          form={f}
          name="reward"
          type="number"
          min={0}
          step={500}
          value={reward}
          onChange={(e) => setRewardValue(e.target.value)}
          placeholder="Not set"
          className={`field !w-[110px] !py-1 text-right tabular-nums ${
            job.reward_confirmed ? "font-semibold text-[var(--color-gold)]" : ""
          }`}
        />
      </td>

      <td className="px-3 py-2.5">
        <label htmlFor={`days-${job.id}`} className="sr-only">
          Days after joining before the reward for {job.title} is due
        </label>
        <input
          id={`days-${job.id}`}
          form={f}
          name="eligibilityDays"
          type="number"
          min={0}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="field !w-[70px] !py-1 text-right tabular-nums"
        />
      </td>

      <td className="px-3 py-2.5 text-center">
        <input
          form={f}
          type="checkbox"
          name="priority"
          checked={priority}
          onChange={(e) => setPriority(e.target.checked)}
          aria-label={`Priority role: ${job.title}`}
          className="h-4 w-4 accent-[var(--color-brand)]"
        />
      </td>

      <td className="px-3 py-2.5 text-right tabular-nums">{job.referral_count}</td>

      <td className="px-3 py-2.5 text-right">
        <form id={f} action={action}>
          <input type="hidden" name="jobId" value={job.id} />
          <button
            type="submit"
            disabled={!dirty || pending}
            className="btn-primary !px-3 !py-1 text-[12.5px] disabled:!opacity-30"
            title={dirty ? `Save as a custom figure: ${reward ? rupees(Number(reward)) : "—"}` : "No changes"}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </form>
      </td>
    </tr>
  );
}
