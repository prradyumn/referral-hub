/**
 * Keka Hire → the Hub's `jobs` table.
 *
 * Read-only against Keka. This never writes to Keka and never touches the
 * Hub-owned reward columns; see the note on upsert_keka_job in db/0003_keka.sql.
 */

import { query } from "@/lib/db";
import { kekaList } from "@/lib/keka/client";
import {
  type KekaJob,
  locationLabel,
  experienceLabel,
  summaryText,
  postedOn,
} from "@/lib/keka/map";

export type { KekaJob, KekaLocation } from "@/lib/keka/map";
export { locationLabel, experienceLabel, summaryText } from "@/lib/keka/map";

// ---------------------------------------------------------------- sync
export type JobSyncResult = {
  read: number;
  written: number;
  opened: number;
  closed: number;
  skippedNoReferral: number;
  watermark: string | null;
};

/**
 * Pull jobs from Keka and upsert them.
 *
 * `since` is the watermark: Keka filters on `lastModified`. A full run passes
 * null. Note that a watermarked run cannot detect a job *deleted* in Keka —
 * only one modified. That is why reconcile below exists.
 */
export async function syncJobs(since?: Date | null): Promise<JobSyncResult> {
  const jobs = await kekaList<KekaJob>("/v1/hire/jobs", {
    // Keka returns dates as epoch seconds but requires ISO 8601 here. Verified
    // against the tenant: epoch is rejected with 400. See CONTEXT.md §16.
    lastModified: since ? since.toISOString() : undefined,
  });

  const result: JobSyncResult = {
    read: jobs.length,
    written: 0,
    opened: 0,
    closed: 0,
    skippedNoReferral: 0,
    watermark: new Date().toISOString(),
  };

  // One call for the whole set. Per-job round trips to Neon in Virginia cost
  // ~250ms each (§4), which made 906 jobs a four-minute sync that timed out.
  const payload = jobs
    .filter((job) => job?.id)
    .map((job) => ({
      keka_job_id: job.id,
      org_job_id: job.orgJobId ?? null,
      title: job.title ?? null,
      department: job.departmentName ?? null,
      location: locationLabel(job),
      experience_band: experienceLabel(job),
      summary: summaryText(job.description),
      posted_on: postedOn(job),
      keka_status: job.status ?? null,
      referral_enabled: job.isReferralEnabled ?? null,
    }));

  result.skippedNoReferral = jobs.filter((j) => j?.isReferralEnabled === false).length;

  if (payload.length) {
    const [row] = await query<{ written: number; opened: number; closed: number }>(
      `select * from upsert_keka_jobs($1::jsonb)`,
      [JSON.stringify(payload)],
    );
    result.written = Number(row?.written ?? 0);
    result.opened = Number(row?.opened ?? 0);
    result.closed = Number(row?.closed ?? 0);
  }

  return result;
}

/**
 * Re-apply `keka_open_job_statuses` to roles already in the database.
 *
 * Changing which Keka statuses count as open is a configuration edit, not a
 * reason to re-read the whole API.
 */
export async function rederiveOpenness(): Promise<{ opened: number; closed: number }> {
  const [row] = await query<{ opened: number; closed: number }>(
    `select * from rederive_keka_job_openness()`,
  );
  return { opened: Number(row?.opened ?? 0), closed: Number(row?.closed ?? 0) };
}

/**
 * Close Hub roles that Keka no longer returns at all.
 *
 * A watermarked pull only sees changes, so a job removed from Keka would stay
 * open in the Hub forever and keep accepting referrals. This runs a full
 * (unwatermarked) list and closes anything missing from it.
 *
 * Deliberately closes rather than deletes: referrals reference jobs with
 * `on delete restrict`, and a role's history has to survive the role.
 */
export async function reconcileJobs(): Promise<{ closed: number; retiredSeed: number }> {
  const jobs = await kekaList<KekaJob>("/v1/hire/jobs", {});
  const liveIds = jobs.map((j) => j.id).filter(Boolean);

  // An empty response is far more likely to be a Keka fault than every role
  // genuinely closing at once. Refuse to act on it.
  if (liveIds.length === 0) {
    throw new Error(
      "Keka returned no jobs at all. Refusing to close every role in the Hub " +
        "on the strength of an empty response.",
    );
  }

  // Retire the ten prototype roles once real ones exist. db/0002_seed.sql
  // describes them as placeholders "carried over from the prototype so Phase 0
  // has real content to browse. Replace with the ATS sync in Phase 1" — this
  // is that replacement. Closed rather than deleted: referrals reference jobs
  // with `on delete restrict`, and any referral made against one must survive.
  const retiredSeed = await query<{ id: string }>(
    `update jobs
        set is_open = false
      where source = 'seed'
        and is_open
        and exists (select 1 from jobs k where k.source = 'keka' and k.is_open)
      returning id`,
  );

  const closed = await query<{ id: string }>(
    `update jobs
        set is_open = false, last_synced_at = now()
      where source = 'keka'
        and is_open
        and keka_job_id is not null
        and not (keka_job_id = any($1::text[]))
      returning id`,
    [liveIds],
  );

  return { closed: closed.length, retiredSeed: retiredSeed.length };
}
