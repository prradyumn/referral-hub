/**
 * Keka Hire → the Hub's referral journey.
 *
 * Reads candidate stage changes and appends them to `referral_stages`, which
 * is what makes `/referrals` show where a candidate has actually reached
 * rather than the illustrative timeline Phase 0 shipped.
 *
 * Two rules shape this file:
 *
 *   · **Only jobs we have referrals against are polled.** Keka holds 502
 *     candidates on a single job; the Hub has no business reading candidates
 *     nobody here referred, and pulling them would burn the 50/min limit for
 *     nothing.
 *
 *   · **Interviews and scorecards are never fetched.** Both endpoints exist.
 *     Commitment 2 keeps feedback and scores in the ATS, and the surest way
 *     not to leak them is not to hold them.
 */

import { query } from "@/lib/db";
import { parseKekaDate } from "@/lib/keka/map";
import { jobCandidates, type CandidateCache } from "@/lib/keka/job-candidates";

type KekaCandidate = {
  id?: string;
  email?: string;
  /** Present on archived candidates. Keka's keys carry spaces. */
  archivedDetails?: Record<string, string | number | null | undefined>;
  jobApplicationDetails?: {
    jobHiringStageId?: string;
    status?: number;
    appliedOn?: string | number;
    movedtoStageOn?: string | number;
    sourceTitle?: string;
  };
};

export type StageSyncResult = {
  read: number;
  written: number;
  jobsPolled: number;
  matched: number;
  advanced: number;
  watermark: string | null;
};

/** The Keka jobs that at least one Hub referral points at. */
async function jobsWithReferrals(): Promise<string[]> {
  const rows = await query<{ keka_job_id: string }>(
    `select distinct j.keka_job_id
       from referrals r
       join jobs j on j.id = r.job_id
      where j.keka_job_id is not null`,
  );
  return rows.map((r) => r.keka_job_id);
}

export async function syncReferralStages(
  since?: Date | null,
  /** Shared with the Keka-referral import, so a job is read once per run. */
  cache?: CandidateCache,
): Promise<StageSyncResult> {
  const jobIds = await jobsWithReferrals();

  const result: StageSyncResult = {
    read: 0,
    written: 0,
    jobsPolled: jobIds.length,
    matched: 0,
    advanced: 0,
    watermark: new Date().toISOString(),
  };

  // No referrals yet means nothing to track. Not a failure — the commonest
  // state on a new deployment.
  if (jobIds.length === 0) return result;

  const rows: {
    keka_job_id: string;
    email: string;
    keka_candidate_id: string | null;
    stage: string;
    occurred_at: string | null;
  }[] = [];

  for (const jobId of jobIds) {
    const candidates = await jobCandidates<KekaCandidate>(jobId, since, cache);

    result.read += candidates.length;

    for (const c of candidates) {
      const d = c.jobApplicationDetails;
      if (!c.email?.trim() || !d?.jobHiringStageId?.trim()) continue;

      // An archived candidate's own date is when it was archived. The reason
      // is deliberately not read: commitment 2 keeps rejection reasoning in
      // the ATS, and the surest way not to show it is not to hold it.
      const archivedOn = c.archivedDetails?.["archived On"];
      const moved =
        parseKekaDate(archivedOn as string | undefined) ??
        parseKekaDate(d.movedtoStageOn) ??
        parseKekaDate(d.appliedOn) ??
        null;

      rows.push({
        keka_job_id: jobId,
        email: c.email.trim(),
        keka_candidate_id: c.id ?? null,
        stage: d.jobHiringStageId.trim(),
        occurred_at: moved ? moved.toISOString() : null,
      });
    }
  }

  if (rows.length) {
    const [out] = await query<{ matched: number; advanced: number }>(
      `select * from apply_keka_candidate_stages($1::jsonb)`,
      [JSON.stringify(rows)],
    );
    result.matched = Number(out?.matched ?? 0);
    result.advanced = Number(out?.advanced ?? 0);
    result.written = result.advanced;
  }

  return result;
}

// ------------------------------------------------------------- reading
export type JourneyStep = {
  stage: string;
  wording: string | null;
  occurred_at: string;
  is_visible: boolean;
  sort_order: number;
};

/**
 * The stages an employee may see for one referral.
 *
 * Filtered to `is_visible` in SQL rather than in the page, so a new screen
 * cannot forget to filter. An unmapped stage is stored but never returned
 * here.
 */
export async function visibleJourney(referralId: string): Promise<JourneyStep[]> {
  return query<JourneyStep>(
    `select s.stage,
            m.employee_wording as wording,
            s.occurred_at,
            coalesce(m.is_visible, false) as is_visible,
            coalesce(m.sort_order, 100)   as sort_order
       from referral_stages s
       left join keka_stage_map m on m.keka_stage_id = s.stage
      where s.referral_id = $1
        and (m.is_visible is true or s.source = 'hub')
      order by s.occurred_at, s.id`,
    [referralId],
  );
}
