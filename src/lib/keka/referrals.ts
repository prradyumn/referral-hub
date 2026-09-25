/**
 * Keka Hire → the Hub: referrals made in Keka.
 *
 * The stage sync follows referrals that began in the Hub. This finds the ones
 * that began in Keka, so the employee who made one sees it in the Hub and is
 * credited for it.
 *
 * It reads every open, referral-enabled job — which the stage sync
 * deliberately does not — and keeps only candidates Keka itself marks as an
 * Employee Referral. Everyone else is dropped in memory and never stored: the
 * Hub still holds no one that nobody here referred.
 *
 * Who referred is decided by src/lib/keka/attribution.ts and db/0018, and the
 * rule is narrow because money follows it: automatic credit only from the one
 * configured Keka field holding a work email. Everything else waits in
 * /admin/keka-referrals for a person.
 */

import { query } from "@/lib/db";
import { parseKekaDate } from "@/lib/keka/map";
import { jobCandidates, type CandidateCache } from "@/lib/keka/job-candidates";
import {
  candidateName,
  fieldNames,
  importCutoff,
  referrerFrom,
  suggestEmployee,
  triage,
  type EmployeeRef,
  type KekaReferralCandidate,
} from "@/lib/keka/attribution";

export type ReferralImportResult = {
  enabled: boolean;
  jobsScanned: number;
  jobsTotal: number;
  /** Every candidate Keka returned across those jobs. */
  read: number;
  /** Of which Keka marked Employee Referral, made on or after the cutoff. */
  referrals: number;
  /** Employee Referrals skipped for having no referral date to check. */
  undated: number;
  credited: number;
  awaitingReview: number;
  written: number;
  watermark: string | null;
  autoCreditField: string | null;
  importSince: string;
};

async function settings(): Promise<Record<string, string>> {
  const rows = await query<{ key: string; value: string }>(
    `select key, value from app_settings
      where key in ('keka_import_referrals', 'keka_referrer_email_field',
                    'keka_referral_import_since', 'allowed_email_domain')`,
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function syncKekaReferrals(
  since?: Date | null,
  /** Shared with the stage sync, so a job is read once per run. */
  cache?: CandidateCache,
  /**
   * Epoch ms after which no further job is read. The cron's steps after this
   * one — the stage sync, the reward engine — must always get to run.
   */
  deadline?: number,
): Promise<ReferralImportResult> {
  const s = await settings();
  const importSince = s.keka_referral_import_since ?? "";
  const field = s.keka_referrer_email_field?.trim() ?? "";
  const result: ReferralImportResult = {
    enabled: s.keka_import_referrals === "true",
    jobsScanned: 0,
    jobsTotal: 0,
    read: 0,
    referrals: 0,
    undated: 0,
    credited: 0,
    awaitingReview: 0,
    written: 0,
    watermark: new Date().toISOString(),
    autoCreditField: field || null,
    importSince,
  };
  if (!result.enabled) return result;

  const cutoff = importCutoff(importSince);
  const domain = (s.allowed_email_domain ?? "").trim().toLowerCase();

  // Random order: if a night ever runs out of time, it is not always the same
  // roles left unread.
  const jobs = await query<{ keka_job_id: string }>(
    `select keka_job_id from jobs
      where is_open and keka_referral_enabled and keka_job_id is not null
      order by random()`,
  );
  const employees = await query<EmployeeRef>(`select id, email, full_name from employees`);
  result.jobsTotal = jobs.length;

  const rows: Record<string, unknown>[] = [];
  for (const { keka_job_id: jobId } of jobs) {
    if (deadline && Date.now() > deadline) break;
    result.jobsScanned++;

    // `since` passes straight through, unnarrowed, so the nightly full run
    // shares its fetch with the stage sync. The cutoff is applied below.
    const candidates = await jobCandidates<KekaReferralCandidate>(jobId, since, cache);
    result.read += candidates.length;

    for (const c of candidates) {
      const applied = parseKekaDate(c.jobApplicationDetails?.appliedOn);
      const decision = triage(c, applied, cutoff);
      if (decision === "undated") result.undated++;
      if (decision !== "import" || !c.id || !applied) continue; // dropped, never stored

      const who = referrerFrom(c, field, domain);
      const clue = who.kind === "hint" ? who.hint : c.jobApplicationDetails?.sourcedBy;
      rows.push({
        keka_job_id: jobId,
        keka_candidate_id: c.id,
        full_name: candidateName(c),
        email: c.email ?? "",
        phone: c.phone ?? "",
        sourced_by: c.jobApplicationDetails?.sourcedBy ?? "",
        referrer_email: who.kind === "email" ? who.email : "",
        referrer_hint: who.kind === "hint" ? who.hint : "",
        fields_seen: fieldNames(c),
        applied_on: applied.toISOString(),
        suggested_employee_id: suggestEmployee(clue, employees) ?? "",
      });
    }
  }

  result.referrals = rows.length;
  if (rows.length) {
    const ready = await query<{ out_row_id: string; out_referrer_email: string }>(
      `select * from upsert_keka_referral_candidates($1::jsonb)`,
      [JSON.stringify(rows)],
    );
    result.written = rows.length;

    // One at a time: each goes through submit_referral's advisory locks and
    // duplicate check, exactly as a referral made in the form does.
    for (const r of ready) {
      const [out] = await query<{ status: string }>(
        `select credit_keka_referral($1, $2) as status`,
        [r.out_row_id, r.out_referrer_email],
      );
      if (out?.status === "credited") result.credited++;
    }
  }

  const [waiting] = await query<{ n: number }>(
    `select count(*)::int as n from keka_referral_candidates where status = 'needs_review'`,
  );
  result.awaitingReview = waiting?.n ?? 0;

  // What was read is kept. But a scan that could not reach every role is not
  // healthy, and convention 10 says silence must mean healthy — so it fails
  // loudly, which /admin/sync alerts on, rather than passing as a success.
  if (result.jobsScanned < result.jobsTotal) {
    throw new Error(
      `Stopped at the time budget after ${result.jobsScanned} of ${result.jobsTotal} roles ` +
        `(${result.credited} credited, ${result.referrals} referrals read). The rest are read ` +
        `next night. If this repeats, the scan needs its own cron.`,
    );
  }
  return result;
}
