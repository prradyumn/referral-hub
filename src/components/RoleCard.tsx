import Link from "next/link";
import { rupees } from "@/lib/format";

export type RoleCardJob = {
  id: string;
  req_id: string;
  title: string;
  department: string;
  location: string;
  experience_band: string;
  is_priority: boolean;
  reward_amount: number;
  reward_confirmed: boolean;
  summary: string | null;
  posted_on: string | null;
};

/**
 * A department mark, standing in for a per-team logo.
 *
 * Colour is derived from the department name rather than stored, so the same
 * team is always the same colour without anyone maintaining a mapping. Hue
 * only — saturation and lightness are fixed, which keeps every badge at the
 * same weight and stops one department shouting louder than another.
 */
function departmentMark(department: string) {
  let hash = 0;
  for (let i = 0; i < department.length; i++) {
    hash = (hash * 31 + department.charCodeAt(i)) % 360;
  }
  const initials = department
    .split(/[\s&/-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

  return {
    initials,
    bg: `hsl(${hash} 58% 95%)`,
    fg: `hsl(${hash} 52% 32%)`,
    ring: `hsl(${hash} 40% 88%)`,
  };
}

function postedLabel(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days) || days < 0) return null;
  if (days === 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "Posted last month" : `Posted ${months} months ago`;
}

const PinIcon = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" fill="none">
    <path
      d="M8 14s5-4.2 5-8A5 5 0 0 0 3 6c0 3.8 5 8 5 8Z"
      stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
    />
    <circle cx="8" cy="6" r="1.8" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
    <path d="M8 4.8V8l2.2 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export default function RoleCard({ job }: { job: RoleCardJob }) {
  const mark = departmentMark(job.department);
  const posted = postedLabel(job.posted_on);

  return (
    <li className="group card flex min-w-0 flex-col p-5 transition hover:border-[var(--color-ink-3)] hover:shadow-[0_1px_3px_rgba(23,27,36,.07),0_8px_24px_-12px_rgba(23,27,36,.18)]">
      {/* Mark + title. The title is the thing people scan, so it gets the
          weight — everything else is subordinate to it. */}
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[14px] font-semibold ring-1"
          style={{ background: mark.bg, color: mark.fg, boxShadow: `inset 0 0 0 1px ${mark.ring}` }}
        >
          {mark.initials}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[19px] font-semibold leading-[1.25] tracking-[-0.011em] text-[var(--color-ink)]">
              {job.title}
            </h2>
            {job.is_priority && (
              <span className="pill shrink-0 bg-[var(--color-gold-soft)] text-[var(--color-gold)]">
                Priority
              </span>
            )}
          </div>
          <p className="mt-1 text-[13.5px] font-medium" style={{ color: mark.fg }}>
            {job.department}
          </p>
        </div>
      </div>

      {/* Location and experience as separate, labelled facts rather than one
          grey run-on — they answer different questions and get scanned
          independently. */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-[var(--color-ink-2)]">
        <span className="inline-flex items-center gap-1.5">
          <PinIcon />
          {job.location}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ClockIcon />
          {job.experience_band}
        </span>
      </div>

      {/* A fixed three-line box whether or not there is a description. 18 of
          the tenant's open roles have none, and letting those cards collapse
          left a ragged hole in the grid next to their neighbours. */}
      <p className="mt-3.5 line-clamp-3 min-h-[4.2rem] text-[14px] leading-[1.6] text-[var(--color-ink-2)]">
        {job.summary ?? (
          <span className="text-[var(--color-ink-3)] italic">
            No description on this role yet — ask the hiring team what they need.
          </span>
        )}
      </p>

      <div className="mt-auto pt-4">
        {job.reward_confirmed ? (
          /* The number is the reason to act, so it is the loudest thing on the
             card after the title. "Up to" because it is paid only if they join
             and complete the qualifying period. The sweep plays on hover. */
          <div className="cash-panel cash-shine flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-3">
            <span className="cash-coin h-10 w-10 text-[16px]" aria-hidden="true">
              ₹
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-bold tracking-[0.12em] text-[#7a5200] uppercase">
                Cash up to
              </p>
              <p className="cash-amount text-[25px] leading-[1.05] font-extrabold">
                {rupees(job.reward_amount)}
              </p>
            </div>
            {/* Drops under the amount on the narrowest phones rather than
                pushing the card off the screen. */}
            <span
              className="ml-auto shrink-0 rounded-full bg-white/75 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-[#7a5200] ring-1 ring-[#a8760f]/25"
              title="Reward points count toward the milestone gifts"
            >
              +{Math.round(job.reward_amount).toLocaleString("en-IN")} pts
            </span>
          </div>
        ) : (
          /* Deliberately quiet: the absence of a number is not a number, and a
             gold panel would draw the eye to nothing. */
          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] pt-3.5">
            <span className="text-[13px] text-[var(--color-ink-3)]">Referral reward</span>
            <span className="text-[13px] text-[var(--color-ink-3)]">To be confirmed</span>
          </div>
        )}

        <Link
          href={`/refer?job=${job.id}`}
          className="btn-primary mt-3.5 w-full"
          aria-label={`Refer someone for ${job.title}`}
        >
          Refer someone
        </Link>

        <p className="mt-2.5 text-center text-[11.5px] text-[var(--color-ink-3)]">
          {[posted, job.req_id].filter(Boolean).join(" · ")}
        </p>
      </div>
    </li>
  );
}
