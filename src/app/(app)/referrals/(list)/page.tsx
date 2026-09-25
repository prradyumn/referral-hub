import Link from "next/link";
import { query } from "@/lib/db";
import { currentEmployee, requireSignedInUser } from "@/lib/employees";
import { rewardLabel, shortDate, initials } from "@/lib/format";
import { Card, PageHead } from "@/components/Chrome";
import ReferralProgress, { CLOSED, stepOf } from "@/components/ReferralProgress";

type Row = {
  id: string;
  ref_code: string;
  status: string;
  current_stage: string | null;
  current_stage_at: string | null;
  submitted_at: string;
  /** "keka" when the referral was made in Keka and brought in by the sync. */
  origin: string;
  keka_applied_on: string | null;
  joined_at: string | null;
  with_ta: boolean;
  reward_status: string | null;
  eligible_from: string | null;
  paid_at: string | null;
  eligibility_days_snapshot: number;
  reward_amount_snapshot: number;
  reward_confirmed_snapshot: boolean;
  candidate_name: string | null;
  job_title: string | null;
  job_location: string | null;
  stage_count: number;
  wordings: string[];
};

export default async function ReferralsPage() {
  await requireSignedInUser();

  const employee = await currentEmployee();
  let rows: Row[] = [];
  let dbDown = employee === null;

  if (employee) {
    try {
      // `where referrer_id = $1` is the whole permission model for this page.
      // Row-level security used to guarantee it; now this clause does, and
      // nothing else will catch its absence. scripts/e2e-scoping.mjs exists
      // to notice if it ever goes missing — run it when this file changes.
      rows = await query<Row>(
        `select r.id, r.ref_code, r.status, r.current_stage, r.current_stage_at,
                r.submitted_at, r.origin, r.keka_applied_on, r.reward_amount_snapshot, r.joined_at,
                r.eligibility_days_snapshot,
                (r.keka_candidate_id is not null or r.ta_added_at is not null) as with_ta,
                w.status as reward_status, w.eligible_from, w.paid_at,
                r.reward_confirmed_snapshot,
                c.full_name as candidate_name,
                j.title     as job_title,
                j.location  as job_location,
                -- ::int: count() is bigint, which node-postgres returns as a
                -- string, so "=== 1" never matched and it read "1 updates".
                (select count(*)::int from referral_stages s where s.referral_id = r.id)
                            as stage_count,
                -- Every visible stage reached, so a closed referral can show
                -- how far it got.
                array(select m.employee_wording
                        from referral_stages s
                        join keka_stage_map m on m.keka_stage_id = s.stage
                       where s.referral_id = r.id and m.is_visible)
                            as wordings
           from referrals r
           join candidates c on c.id = r.candidate_id
           join jobs       j on j.id = r.job_id
           left join referral_rewards w on w.referral_id = r.id
          where r.referrer_id = $1
          order by r.submitted_at desc`,
        [employee.id],
      );
    } catch {
      dbDown = true;
    }
  }

  return (
    <>
      <PageHead
        title="My referrals"
        lede="Everyone you have referred, and where they have reached."
      />

      {dbDown && (
        <Card className="mb-6 border-dashed">
          <p className="text-[14px] leading-relaxed text-[var(--color-ink-2)]">
            <strong className="font-semibold text-[var(--color-ink)]">
              No database connected.
            </strong>{" "}
            Sign-in works, but referrals cannot be read or written until{" "}
            <code className="rounded bg-[var(--color-ground)] px-1.5 py-0.5 text-[13px]">
              DATABASE_URL
            </code>{" "}
            is set and the files in{" "}
            <code className="rounded bg-[var(--color-ground)] px-1.5 py-0.5 text-[13px]">db/</code>{" "}
            have been applied.
          </p>
        </Card>
      )}

      {rows.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-[17px] font-medium">No referrals yet</p>
          <p className="mx-auto mt-2 max-w-[42ch] text-[14.5px] leading-relaxed text-[var(--color-ink-3)]">
            When you refer someone, they appear here with every stage, updated as Talent
            Acquisition moves them along.
          </p>
          <Link href="/roles" className="btn-primary mt-6">
            Browse open roles
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-soft)] text-[13px] font-semibold text-[var(--color-brand)]">
                  {initials(r.candidate_name ?? "?")}
                </span>
                <div className="min-w-[180px] flex-1">
                  <p className="text-[15.5px] font-semibold leading-snug">
                    <Link href={`/referrals/${r.id}`} className="hover:underline">
                      {r.candidate_name ?? "Candidate"}
                    </Link>
                  </p>
                  <p className="text-[13px] text-[var(--color-ink-3)]">
                    {r.job_title ?? "Role"}
                    {r.job_location ? ` · ${r.job_location}` : ""} · {r.ref_code}
                    {r.origin === "keka" && (
                      <span className="ml-1.5 rounded bg-[var(--color-ground)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-ink-2)]">
                        Made in Keka
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={
                      r.reward_confirmed_snapshot
                        ? "text-[15px] font-semibold text-[var(--color-gold)]"
                        : "text-[13px] font-medium text-[var(--color-ink-3)]"
                    }
                  >
                    {rewardLabel(r.reward_amount_snapshot, r.reward_confirmed_snapshot)}
                  </p>
                  <p className="text-[12.5px] text-[var(--color-ink-3)]">
                    {r.joined_at ? "your reward" : r.reward_confirmed_snapshot ? "if they join" : "reward"}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <ReferralProgress
                  compact
                  p={{
                    current_stage: r.current_stage,
                    current_stage_at: r.current_stage_at,
                    submitted_at: r.submitted_at,
                    joined_at: r.joined_at,
                    with_ta: r.with_ta,
                    reward_amount: r.reward_amount_snapshot,
                    reward_confirmed: r.reward_confirmed_snapshot,
                    reward_status: r.reward_status,
                    eligible_from: r.eligible_from,
                    eligibility_days: r.eligibility_days_snapshot,
                    paid_at: r.paid_at,
                    reached: Math.max(0, ...r.wordings.filter((w) => w !== CLOSED).map(stepOf)),
                  }}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--color-line)] pt-3">
                <p className="text-[12.5px] text-[var(--color-ink-3)]">
                  {r.current_stage_at
                    ? `Updated ${shortDate(r.current_stage_at)}`
                    : `Referred ${shortDate(r.keka_applied_on ?? r.submitted_at)}`}{" "}
                  ·{" "}
                  {r.stage_count === 1 ? "1 update" : `${r.stage_count} updates`}
                </p>
                <Link
                  href={`/referrals/${r.id}`}
                  className="text-[13px] font-medium text-[var(--color-brand)] hover:underline"
                >
                  See the full journey →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-[var(--color-ink-3)]">
        Stages refresh from Keka once a day. Interview feedback and scores stay
        confidential and are never shown here.
      </p>
    </>
  );
}
