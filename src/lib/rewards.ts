import "server-only";

import { query, queryOne } from "@/lib/db";

/**
 * The reward ledger, read side.
 *
 * Every query here filters by the signed-in employee's id. Since the Auth.js
 * migration there is no RLS underneath (CONTEXT.md §6), so a missing
 * `referrer_id = $1` is a data leak with nothing to catch it.
 */

export type RewardStatus =
  | "pending_joining"
  | "eligible"
  | "approved"
  | "paid"
  | "forfeited";

export type EmployeeReward = {
  reward_id: string | null;
  referral_id: string;
  ref_code: string;
  candidate_name: string;
  job_title: string;
  amount: number;
  reward_confirmed: boolean;
  status: RewardStatus | "not_joined";
  joined_at: string | null;
  eligible_from: string | null;
  paid_at: string | null;
  paid_reference: string | null;
};

/** Plain English for a reward state, and why it is where it is. */
export function describeReward(r: EmployeeReward): { label: string; note: string } {
  const on = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

  switch (r.status) {
    case "paid":
      return {
        label: "Paid",
        note: r.paid_reference ? `Reference ${r.paid_reference}` : `Paid ${on(r.paid_at)}`,
      };
    case "approved":
      return { label: "Approved, awaiting payroll", note: "Gross — income tax applies" };
    case "eligible":
      return { label: "Eligible now", note: "Waiting on HR to approve it" };
    case "pending_joining":
      return {
        label: "Qualifying period",
        note: r.eligible_from ? `Eligible from ${on(r.eligible_from)}` : "Counting from their joining date",
      };
    case "forfeited":
      return { label: "Not payable", note: "Speak to HR if this looks wrong" };
    default:
      return {
        label: "If they join",
        note: r.reward_confirmed ? "Nothing is owed until they join" : "Reward not set for this role yet",
      };
  }
}

/**
 * Every referral this employee has made, with its reward state.
 *
 * Includes referrals whose candidate has not joined, because "nothing owed
 * yet" is information the employee wants too — and hiding them would make
 * the page look emptier than the person's actual effort.
 */
export async function employeeRewards(employeeId: string): Promise<EmployeeReward[]> {
  return query<EmployeeReward>(
    `select w.id                        as reward_id,
            r.id                        as referral_id,
            r.ref_code,
            c.full_name                 as candidate_name,
            j.title                     as job_title,
            coalesce(w.amount, r.reward_amount_snapshot) as amount,
            r.reward_confirmed_snapshot as reward_confirmed,
            coalesce(w.status, 'not_joined')             as status,
            r.joined_at,
            w.eligible_from,
            w.paid_at,
            w.paid_reference
       from referrals r
       join candidates c on c.id = r.candidate_id
       join jobs       j on j.id = r.job_id
       left join referral_rewards w on w.referral_id = r.id
      where r.referrer_id = $1
      order by r.submitted_at desc`,
    [employeeId],
  );
}

export type RewardTotals = {
  referrals_made: number;
  joined: number;
  in_progress: number;
  earned_total: number;
  paid_total: number;
  awaiting_total: number;
};

export async function rewardTotals(employeeId: string): Promise<RewardTotals> {
  const row = await queryOne<RewardTotals>(
    `select count(*)::int                                          as referrals_made,
            count(*) filter (where r.joined_at is not null)::int   as joined,
            count(*) filter (where r.joined_at is null)::int       as in_progress,
            -- Only amounts that were actually agreed are counted as money.
            -- An unconfirmed placeholder is not something to total up and
            -- show an employee as "earned".
            coalesce(sum(w.amount) filter (
              where w.status in ('eligible','approved','paid')
                and r.reward_confirmed_snapshot), 0)::int          as earned_total,
            coalesce(sum(w.amount) filter (
              where w.status = 'paid' and r.reward_confirmed_snapshot), 0)::int as paid_total,
            coalesce(sum(w.amount) filter (
              where w.status in ('eligible','approved')
                and r.reward_confirmed_snapshot), 0)::int          as awaiting_total
       from referrals r
       left join referral_rewards w on w.referral_id = r.id
      where r.referrer_id = $1`,
    [employeeId],
  );

  return (
    row ?? {
      referrals_made: 0,
      joined: 0,
      in_progress: 0,
      earned_total: 0,
      paid_total: 0,
      awaiting_total: 0,
    }
  );
}

// ------------------------------------------------------------ milestones
export type MilestoneProgress = {
  name: string;
  threshold: number;
  blurb: string | null;
  unlocked: boolean;
};

/**
 * Milestone tiers and whether this employee has reached them.
 *
 * Counted on referrals that actually joined — a milestone is for people
 * brought in, not forms filled. D12 (lifetime or per financial year) is
 * unanswered; `app_settings.milestone_scope` records that this is built as
 * lifetime.
 */
export async function milestoneProgress(
  employeeId: string,
): Promise<{ joined: number; tiers: MilestoneProgress[]; next: MilestoneProgress | null }> {
  const tiers = await query<MilestoneProgress & { joined: number }>(
    `with mine as (
       select count(*)::int as joined
         from referrals
        where referrer_id = $1 and joined_at is not null
     )
     select t.name, t.threshold, t.blurb,
            (select joined from mine) >= t.threshold as unlocked,
            (select joined from mine) as joined
       from milestone_tiers t
      where t.is_active
      order by t.sort_order, t.threshold`,
    [employeeId],
  );

  const joined = tiers[0]?.joined ?? 0;
  const next = tiers.find((t) => !t.unlocked) ?? null;
  return { joined, tiers, next };
}

// ----------------------------------------------------------- leaderboard
export type LeaderboardPeriod = "monthly" | "quarterly" | "yearly" | "all-time";

export const LEADERBOARD_PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: "monthly", label: "This month" },
  { id: "quarterly", label: "This quarter" },
  { id: "yearly", label: "This year" },
  { id: "all-time", label: "All time" },
];

export type LeaderboardRow = {
  employee_id: string;
  name: string;
  department: string | null;
  joined: number;
  earned: number;
};

const PERIOD_SQL: Record<LeaderboardPeriod, string> = {
  monthly: "date_trunc('month', now())",
  quarterly: "date_trunc('quarter', now())",
  yearly: "date_trunc('year', now())",
  "all-time": "'-infinity'::timestamptz",
};

/**
 * Who has brought the most people in.
 *
 * Ranked on referrals that joined within the period, not referrals made —
 * otherwise the leaderboard rewards volume over judgement, which is the
 * behaviour a referral programme least wants to encourage.
 *
 * §12 puts the leaderboard behind a feature flag because publicly ranking
 * colleagues is a culture decision. `app_settings.leaderboard_enabled`
 * carries that; this function does not check it, the page does.
 */
export async function leaderboard(
  period: LeaderboardPeriod,
  limit = 10,
): Promise<LeaderboardRow[]> {
  return query<LeaderboardRow>(
    `select e.id                             as employee_id,
            coalesce(e.full_name, split_part(e.email, '@', 1)) as name,
            e.department,
            count(*)::int                    as joined,
            coalesce(sum(w.amount) filter (
              where r.reward_confirmed_snapshot), 0)::int as earned
       from referrals r
       join employees e on e.id = r.referrer_id
       left join referral_rewards w on w.referral_id = r.id
      where r.joined_at is not null
        and r.joined_at >= ${PERIOD_SQL[period]}
      group by e.id, e.full_name, e.email, e.department
      order by joined desc, earned desc, name
      limit $1`,
    [limit],
  );
}

export async function leaderboardEnabled(): Promise<boolean> {
  const row = await queryOne<{ value: string }>(
    `select value from app_settings where key = 'leaderboard_enabled'`,
  );
  return row?.value?.trim().toLowerCase() === "true";
}

// ---------------------------------------------------------------- admin
export type AdminReward = EmployeeReward & {
  referrer_name: string | null;
  referrer_email: string;
};

export async function allRewards(status?: string): Promise<AdminReward[]> {
  return query<AdminReward>(
    `select w.id                        as reward_id,
            r.id                        as referral_id,
            r.ref_code,
            c.full_name                 as candidate_name,
            j.title                     as job_title,
            w.amount,
            r.reward_confirmed_snapshot as reward_confirmed,
            w.status,
            r.joined_at,
            w.eligible_from,
            w.paid_at,
            w.paid_reference,
            e.full_name                 as referrer_name,
            e.email                     as referrer_email
       from referral_rewards w
       join referrals  r on r.id = w.referral_id
       join candidates c on c.id = r.candidate_id
       join jobs       j on j.id = r.job_id
       join employees  e on e.id = r.referrer_id
      where ($1::text is null or w.status = $1)
      order by
        case w.status
          when 'eligible' then 0 when 'approved' then 1
          when 'pending_joining' then 2 else 3 end,
        w.eligible_from nulls last`,
    [status ?? null],
  );
}

export type RewardException = {
  kind: string;
  referral_id: string;
  ref_code: string;
  detail: string;
};

export async function rewardExceptions(): Promise<RewardException[]> {
  return query<RewardException>(`select * from reward_exceptions()`);
}
