/**
 * One full Keka sync run: jobs → bands → Keka referrals → stages → rewards → pushes.
 *
 * Shared by the nightly cron (src/app/api/cron/keka/route.ts) and the admin
 * "Sync now" button, so a click does exactly what 08:00 IST does — no second
 * pipeline to drift from the first.
 *
 * Node runtime only: it reaches pg and the Keka client, both server-only.
 */

import { syncJobs, reconcileJobs } from "@/lib/keka/jobs";
import { sweepPendingPushes, pushEnabled } from "@/lib/keka/candidates";
import { syncReferralStages } from "@/lib/keka/stages";
import { syncKekaReferrals } from "@/lib/keka/referrals";
import { newCandidateCache } from "@/lib/keka/job-candidates";
import { recordedSync } from "@/lib/keka/sync";
import { query, queryOne } from "@/lib/db";
import { applyBands, type BandApplyResult } from "@/lib/band-apply";

/**
 * How long a "running" row blocks another run. A run is capped at 300s by
 * maxDuration; a function killed at that ceiling never marks its row finished,
 * so the lock must expire on its own rather than block every later run.
 */
const RUNNING_WINDOW = "6 minutes";

export type KekaRunSummary = {
  ok: boolean;
  mode: "full" | "incremental";
  elapsedMs: number;
  jobs: {
    status: string;
    read: number;
    written: number;
    detail: unknown;
    error: string | null;
  };
  bands: BandApplyResult | { error: string } | null;
  kekaReferrals: { status: string; detail: unknown; error: string | null };
  stages: { status: string; detail: unknown; error: string | null };
  rewards: { created: number; became_eligible: number } | { error: string } | null;
  reconcile:
    | { closed: number | null; retiredSeedRoles: number | null; error: string | null }
    | "skipped (incremental run)";
  pushes: { read: number; written: number; failed: number } | { error: string } | "disabled";
};

/**
 * When the run already in progress started, or null if none is.
 *
 * A check, not a lock: two runs starting in the same instant could both pass
 * it. The button is disabled while it waits and the cron fires once a day, so
 * the window is tiny — and the cost of losing that race is a slower run that
 * the client's 429 handling absorbs, not wrong data. Every write the sync makes
 * is an idempotent upsert.
 */
export async function runningSince(): Promise<string | null> {
  const row = await queryOne<{ started_at: string }>(
    `select started_at from integration_sync_runs
      where integration = 'keka' and status = 'running'
        and started_at > now() - interval '${RUNNING_WINDOW}'
      order by started_at desc
      limit 1`,
  );
  return row?.started_at ?? null;
}

export async function runKekaSync({ full }: { full: boolean }): Promise<KekaRunSummary> {
  const started = Date.now();

  // ---- jobs -------------------------------------------------------------
  const jobs = await recordedSync(
    "jobs",
    async (since) => {
      const r = await syncJobs(full ? null : since);
      return { read: r.read, written: r.written, watermark: r.watermark, detail: r };
    },
    { full },
  );

  // A full run also closes roles Keka no longer returns. A watermarked run
  // cannot see a deletion, so this only runs when we have the whole list.
  let reconciled: { closed: number; retiredSeed: number } | null = null;
  let reconcileError: string | null = null;
  if (full && !jobs.error) {
    try {
      reconciled = await reconcileJobs();
    } catch (e) {
      reconcileError = e instanceof Error ? e.message : String(e);
    }
  }

  // ---- reward bands ------------------------------------------------------
  // After the jobs sync, so a role that just arrived from Keka is banded and
  // priced in the same run.
  let bands: BandApplyResult | null = null;
  let bandError: string | null = null;
  if (!jobs.error) {
    try {
      bands = await applyBands();
    } catch (e) {
      bandError = e instanceof Error ? e.message : String(e);
    }
  }

  // One fetch per job for the rest of this run. The Keka-referral import and
  // the stage sync read the same endpoint for the same jobs; fetched twice,
  // the pair would pass maxDuration once referrals span most open roles.
  const candidates = newCandidateCache();

  // ---- referrals made in Keka --------------------------------------------
  // Before the stage sync, so a referral found in Keka tonight gets its real
  // stages — and, if it has reached Hired, its reward — in this same run.
  const kekaReferrals = await recordedSync(
    "referrals",
    async (since) => {
      // Stop reading new roles three minutes in, leaving two for the stage
      // sync, the reward engine and the pushes, which exist already and must
      // not be starved by this one.
      const r = await syncKekaReferrals(full ? null : since, candidates, started + 180_000);
      return { read: r.read, written: r.written, watermark: r.watermark, detail: r };
    },
    { full },
  );

  // ---- candidate stages -------------------------------------------------
  // Only polls jobs the Hub has referrals against, so this costs nothing
  // until someone has actually referred a person.
  const stages = await recordedSync(
    "candidates",
    async (since) => {
      const r = await syncReferralStages(full ? null : since, candidates);
      return { read: r.read, written: r.written, watermark: r.watermark, detail: r };
    },
    { full },
  );

  // ---- reward engine ----------------------------------------------------
  // Runs after stages, because a reward can only exist once the stage sync
  // has seen the candidate reach Hired. Idempotent, so running it every time
  // is the whole design.
  let rewards: { created: number; became_eligible: number } | null = null;
  let rewardError: string | null = null;
  try {
    const [row] = await query<{ created: number; became_eligible: number }>(
      `select * from refresh_reward_states()`,
    );
    rewards = {
      created: Number(row?.created ?? 0),
      became_eligible: Number(row?.became_eligible ?? 0),
    };
  } catch (e) {
    rewardError = e instanceof Error ? e.message : String(e);
  }

  // ---- candidate pushes -------------------------------------------------
  // Retries anything the submit-time push could not deliver.
  let pushes: { read: number; written: number; failed: number } | null = null;
  let pushError: string | null = null;
  if (await pushEnabled()) {
    try {
      pushes = await sweepPendingPushes();
    } catch (e) {
      pushError = e instanceof Error ? e.message : String(e);
    }
  }

  const ok =
    !jobs.error && !bandError && !kekaReferrals.error && !stages.error &&
    !reconcileError && !pushError && !rewardError;

  return {
    ok,
    mode: full ? "full" : "incremental",
    elapsedMs: Date.now() - started,
    jobs: {
      status: jobs.run.status,
      read: jobs.run.records_read,
      written: jobs.run.records_written,
      detail: jobs.result ? (jobs.result as { detail: unknown }).detail : null,
      error: jobs.error?.message ?? null,
    },
    bands: bands ?? (bandError ? { error: bandError } : null),
    kekaReferrals: {
      status: kekaReferrals.run.status,
      detail: kekaReferrals.result ? (kekaReferrals.result as { detail: unknown }).detail : null,
      error: kekaReferrals.error?.message ?? null,
    },
    stages: {
      status: stages.run.status,
      detail: stages.result ? (stages.result as { detail: unknown }).detail : null,
      error: stages.error?.message ?? null,
    },
    rewards: rewards ?? (rewardError ? { error: rewardError } : null),
    reconcile: full
      ? {
          closed: reconciled?.closed ?? null,
          retiredSeedRoles: reconciled?.retiredSeed ?? null,
          error: reconcileError,
        }
      : "skipped (incremental run)",
    pushes: pushes ?? (pushError ? { error: pushError } : "disabled"),
  };
}
