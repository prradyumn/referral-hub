import { rupees, shortDate } from "@/lib/format";

/**
 * Where a referral has reached, as five steps anyone can read at a glance,
 * and what happens next.
 *
 * Keka has eight stages, three of them interview rounds, and the timeline
 * listed whichever ones had happened — which told you where someone had been
 * but not how far there was to go. This folds them into the five that matter
 * to the person who referred, keeps "closed" separate rather than as a sixth
 * step (it is an ending, not progress), and once someone joins turns into a
 * countdown to the reward.
 *
 * Reads the employee wording from keka_stage_map, which is what
 * referrals.current_stage holds.
 */

export const STEPS = ["Received", "Shortlisted", "Interviewing", "Offer accepted", "Joined"] as const;

const STEP_OF: Record<string, number> = {
  "Referral received": 0,
  "Referral submitted": 0,
  "Profile shortlisted": 1,
  Interviewing: 2,
  "Offer accepted": 3,
  Joined: 4,
};

export const CLOSED = "No longer in process";

export type Progress = {
  current_stage: string | null;
  current_stage_at: string | null;
  submitted_at: string;
  joined_at: string | null;
  /** Set once TA has the candidate: matched in Keka, or ticked off in the inbox. */
  with_ta: boolean;
  reward_amount: number;
  reward_confirmed: boolean;
  reward_status: string | null;
  eligible_from: string | null;
  eligibility_days: number;
  paid_at: string | null;
  /** The furthest step reached before it closed, when the journey is known. */
  reached?: number;
};

const DAY = 86_400_000;
// Outside the component: reading the clock is not a render-time concern.
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));
const msSince = (iso: string) => Date.now() - new Date(iso).getTime();
const daysUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY));

export function stepOf(stage: string | null): number {
  return stage ? (STEP_OF[stage] ?? 0) : 0;
}

function nextFor(p: Progress, step: number, closed: boolean): string {
  if (closed)
    return "They are no longer in process for this role. Thank you for the referral — if another role suits them better, you can refer them again.";
  switch (step) {
    case 0:
      return p.with_ta
        ? "Talent Acquisition has their profile. Next, the hiring team takes a first look."
        : "Waiting for Talent Acquisition to add them to Keka. Nothing for you to do.";
    case 1:
      return "The hiring team liked the profile. Next, interviews get scheduled.";
    case 2:
      return "Interviews are under way. Feedback stays confidential, so you will only see the outcome.";
    case 3:
      return "They accepted the offer. Once they join, the reward countdown starts.";
    default:
      return rewardLine(p);
  }
}

function rewardLine(p: Progress): string {
  const cash = p.reward_confirmed ? rupees(p.reward_amount) : "Your reward";
  switch (p.reward_status) {
    case "paid":
      return `${cash} was paid${p.paid_at ? ` on ${shortDate(p.paid_at)}` : ""}.`;
    case "approved":
      return `${cash} is approved and goes out with the next payroll.`;
    case "eligible":
      return `${cash} is due. HR approves it next, then it goes out with payroll.`;
    case "forfeited":
      return "This reward is not payable. HR can tell you why.";
    default:
      return p.eligible_from
        ? `${cash} becomes due on ${shortDate(p.eligible_from)}, once they have been here ${p.eligibility_days} days.`
        : `${cash} becomes due once they have been here ${p.eligibility_days} days.`;
  }
}

export default function ReferralProgress({
  p,
  compact = false,
}: {
  p: Progress;
  compact?: boolean;
}) {
  const closed = p.current_stage === CLOSED;
  const step = closed ? (p.reached ?? -1) : stepOf(p.current_stage);
  const since = p.current_stage_at ?? p.submitted_at;
  const days = daysSince(since);

  // The countdown, once they have joined and it is still running.
  let countdown: { pct: number; left: number } | null = null;
  if (!closed && step === 4 && p.joined_at && p.eligible_from && (p.reward_status ?? "pending_joining") === "pending_joining") {
    const span = new Date(p.eligible_from).getTime() - new Date(p.joined_at).getTime();
    const done = msSince(p.joined_at);
    countdown = {
      pct: span > 0 ? Math.min(100, Math.max(0, (done / span) * 100)) : 100,
      left: daysUntil(p.eligible_from),
    };
  }

  return (
    <div>
      <ol
        className="flex items-start"
        aria-label={closed ? "Referral closed" : `Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
      >
        {STEPS.map((label, i) => {
          const done = i < step || (i === step && i === 4);
          const now = i === step && !closed && i !== 4;
          const current = i === step && !closed;
          return (
            <li key={label} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
              {/* The line into this step. On a phone only the current step is
                  labelled: five labels in 350px ran into each other. */}
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute top-[9px] right-1/2 h-[2px] w-full ${
                    i <= step && !closed ? "bg-[var(--color-good)]" : "bg-[var(--color-line)]"
                  }`}
                />
              )}
              <span
                aria-hidden="true"
                className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                  closed
                    ? i <= step
                      ? "border-[var(--color-ink-3)] bg-[var(--color-ink-3)]"
                      : "border-[var(--color-line)] bg-white"
                    : done
                      ? "border-[var(--color-good)] bg-[var(--color-good)]"
                      : now
                        ? "border-[var(--color-brand)] bg-white ring-4 ring-[var(--color-brand-soft)]"
                        : "border-[var(--color-line)] bg-white"
                }`}
              >
                {(done || (closed && i <= step)) && (
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
                    <path d="m2.5 6.2 2.3 2.3 4.7-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {now && <span className="h-2 w-2 rounded-full bg-[var(--color-brand)]" />}
              </span>
              <span
                className={`mt-1.5 px-0.5 text-[11px] leading-tight sm:text-[12px] ${
                  now ? "font-semibold text-[var(--color-brand)]" : i <= step && !closed ? "text-[var(--color-ink)]" : "text-[var(--color-ink-3)]"
                } ${!current ? "max-sm:sr-only" : "whitespace-nowrap"}`}
              >
                {label}
                {now && <span className="sr-only"> (current step)</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {closed && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ground)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-ink-2)]">
          Closed{p.current_stage_at ? ` on ${shortDate(p.current_stage_at)}` : ""}
        </p>
      )}

      {!compact && (
        <div className="mt-5 rounded-lg bg-[var(--color-ground)] px-4 py-3.5">
          {!closed && step < 4 && (
            <p className="text-[12px] font-medium text-[var(--color-ink-3)]">
              {days === 0 ? "Reached this step today" : `${days} day${days === 1 ? "" : "s"} at this step`}
            </p>
          )}
          <p className="mt-0.5 text-[14px] leading-relaxed text-[var(--color-ink)]">
            <span className="font-semibold">What happens next: </span>
            {nextFor(p, step, closed)}
          </p>
          {countdown && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-[12.5px]">
                <span className="font-medium text-[var(--color-gold)]">Reward countdown</span>
                <span className="text-[var(--color-ink-2)] tabular-nums">
                  {countdown.left === 0 ? "Due today" : `${countdown.left} day${countdown.left === 1 ? "" : "s"} to go`}
                </span>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-white"
                role="progressbar"
                aria-label="Days until the reward is due"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(countdown.pct)}
              >
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#f5c451,#d99a1e)]" style={{ width: `${countdown.pct}%` }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
