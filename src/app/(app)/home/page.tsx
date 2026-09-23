import { currentEmployee, requireSignedInUser } from "@/lib/employees";
import { query } from "@/lib/db";
import {
  rewardTotals, milestoneProgress, leaderboard, leaderboardEnabled,
} from "@/lib/rewards";
import { points, rupees, shortDate, initials } from "@/lib/format";
import { Card, PageHead, QuietLink, StatGroup } from "@/components/Chrome";
import WelcomeGate, { type Tier } from "@/components/WelcomeGate";

/**
 * Should the programme poster show?
 *
 * `every_visit` — the configured default — means exactly that: it appears on
 * every arrival at Home. `once` falls back to the acknowledgement on the
 * employee row. Which of the two applies is HR's call, not the component's,
 * so it lives in app_settings (convention 2).
 */
async function posterFor(ackAt: string | null) {
  const [mode] = await query<{ value: string }>(
    `select value from app_settings where key = 'welcome_poster_mode'`,
  );
  const everyVisit = (mode?.value ?? "every_visit").trim() !== "once";
  if (!everyVisit && ackAt !== null) return null;

  const [tiers, [range]] = await Promise.all([
    query<Tier>(
      `select name, threshold, blurb, art from milestone_tiers
        where is_active order by threshold, sort_order`,
    ),
    // The spread of the band table, so the poster's cash line is HR's real
    // range rather than a number typed into the component.
    query<{ min: number; max: number }>(
      `select min(amount)::int as min, max(amount)::int as max
         from reward_bands where not needs_clarification`,
    ),
  ]);
  if (!tiers.length) return null;
  return { tiers, cashRange: range?.max ? range : null };
}

/** The most recent thing that actually happened to one of your referrals. */
async function latestUpdate(employeeId: string) {
  const [row] = await query<{
    candidate_name: string;
    job_title: string;
    stage: string;
    occurred_at: string;
    referral_id: string;
  }>(
    `select c.full_name as candidate_name, j.title as job_title,
            m.employee_wording as stage, s.occurred_at, r.id as referral_id
       from referral_stages s
       join referrals  r on r.id = s.referral_id
       join candidates c on c.id = r.candidate_id
       join jobs       j on j.id = r.job_id
       join keka_stage_map m on m.keka_stage_id = s.stage
      where r.referrer_id = $1
        and m.is_visible
        and m.employee_wording is not null
      order by s.occurred_at desc, s.id desc
      limit 1`,
    [employeeId],
  );
  return row ?? null;
}

export default async function HomePage() {
  const user = await requireSignedInUser();
  const firstName = user.name.split(/[\s.]+/)[0];
  const title = `Hello, ${firstName[0].toUpperCase()}${firstName.slice(1)}`;

  const employee = await currentEmployee();
  if (!employee) {
    return (
      <>
        <PageHead title={title} lede="Where your referrals have reached, and what they are worth." />
        <Card className="border-dashed">
          <p className="text-[14px] text-[var(--color-ink-2)]">
            Your dashboard needs the database, which is not reachable right now.
          </p>
        </Card>
      </>
    );
  }

  const [totals, milestones, latest, boardOn, poster] = await Promise.all([
    rewardTotals(employee.id),
    milestoneProgress(employee.id),
    latestUpdate(employee.id),
    leaderboardEnabled(),
    posterFor(employee.welcome_ack_at),
  ]);
  const top3 = boardOn ? await leaderboard("monthly", 3) : [];

  const next = milestones.next;
  const pct = next ? Math.min(100, Math.round((milestones.points / next.threshold) * 100)) : 100;

  return (
    <>
      {poster && <WelcomeGate tiers={poster.tiers} cashRange={poster.cashRange} />}

      <PageHead title={title} lede="Where your referrals have reached, and what they are worth." />

      <h2 className="mb-3 text-[13px] font-medium tracking-wide text-[var(--color-ink-3)] uppercase">
        Your programme
      </h2>

      <div className="grid gap-3 lg:grid-cols-4">
        <StatGroup
          heading="Referrals"
          accent="var(--color-brand)"
          items={[
            { value: String(totals.referrals_made), label: "Referred" },
            { value: String(totals.joined), label: "Joined" },
            { value: String(totals.in_progress), label: "In progress" },
          ]}
        />
        <StatGroup
          heading="Cash"
          className="lg:col-span-2"
          accent="var(--color-gold)"
          items={[
            { value: rupees(totals.earned_total), label: "Earned" },
            { value: rupees(totals.paid_total), label: "Paid" },
            { value: rupees(totals.awaiting_total), label: "To be received" },
          ]}
        />
        <StatGroup
          heading="Gifts"
          accent="var(--color-mint)"
          items={[
            { value: String(milestones.tiers.filter((t) => t.unlocked).length), label: "Unlocked" },
            { value: String(milestones.tiers.length), label: "Tiers" },
          ]}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="mb-3 text-[13px] font-medium text-[var(--color-ink-2)]">Latest update</p>

          {latest ? (
            <div className="flex items-start gap-3.5">
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-good-soft,#e7f6ec)] text-[15px] text-[var(--color-good)]"
                aria-hidden="true"
              >
                ✓
              </span>
              <div className="min-w-0">
                <p className="text-[15.5px] font-semibold leading-snug">
                  {latest.candidate_name} — {latest.stage}
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-ink-2)]">
                  {latest.job_title}
                </p>
                <p className="mt-2 text-[12.5px] text-[var(--color-ink-3)]">
                  {shortDate(latest.occurred_at)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[14px] leading-relaxed text-[var(--color-ink-2)]">
              {totals.referrals_made === 0
                ? "You have not referred anyone yet. When you do, every stage appears here as Talent Acquisition moves them along."
                : "Nothing has moved yet. Stages update automatically from Keka — you never need to chase a recruiter."}
            </p>
          )}

          <div className="mt-5 border-t border-[var(--color-line)] pt-4">
            <QuietLink href="/referrals">See all your referrals →</QuietLink>
          </div>
        </Card>

        <Card>
          <p className="mb-3 text-[13px] font-medium text-[var(--color-ink-2)]">Next milestone</p>

          {next ? (
            <>
              <p className="text-[17px] font-semibold">{next.name}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
                {next.blurb}
              </p>
              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-ground)]"
                role="progressbar"
                aria-valuenow={milestones.points}
                aria-valuemin={0}
                aria-valuemax={next.threshold}
                aria-label={`${points(milestones.points)} of ${points(next.threshold)}`}
              >
                <div
                  className="h-full rounded-full bg-[var(--color-mint)] transition-[width] duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-[12.5px] text-[var(--color-ink-3)]">
                {points(milestones.points)} of {points(next.threshold)}
              </p>
            </>
          ) : (
            <p className="text-[14px] leading-relaxed text-[var(--color-ink-2)]">
              Every gift unlocked — {points(milestones.points)} earned.
            </p>
          )}

          <div className="mt-4 border-t border-[var(--color-line)] pt-4">
            <QuietLink href="/rewards">All rewards and gifts →</QuietLink>
          </div>
        </Card>
      </div>

      {/* Only rendered when HR has turned the leaderboard on (§12). */}
      {boardOn && top3.length > 0 && (
        <Card className="mt-3">
          <p className="mb-4 text-[13px] font-medium text-[var(--color-ink-2)]">
            Top referrers this month
          </p>
          <ol className="grid gap-2 sm:grid-cols-3">
            {top3.map((p, i) => (
              <li
                key={p.employee_id}
                className="flex items-center gap-3 rounded-lg border border-[var(--color-line)] px-3.5 py-3"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                    i === 0
                      ? "bg-[var(--color-gold-soft)] text-[var(--color-gold)]"
                      : "bg-[var(--color-ground)] text-[var(--color-ink-3)]"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[11.5px] font-semibold text-[var(--color-brand)]">
                  {initials(p.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{p.name}</p>
                  <p className="text-[12px] text-[var(--color-ink-3)]">
                    {p.joined} joined
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 border-t border-[var(--color-line)] pt-4">
            <QuietLink href="/leaderboard">See the leaderboard →</QuietLink>
          </div>
        </Card>
      )}
    </>
  );
}
