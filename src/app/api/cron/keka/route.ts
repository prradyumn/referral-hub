/**
 * The Keka sync entry point.
 *
 * Triggered by Vercel Cron in production and by curl locally:
 *
 *   curl -H "authorization: Bearer $CRON_SECRET" \
 *        'http://localhost:3000/api/cron/keka?full=1'
 *
 * CONTEXT.md convention 9: a scheduled pull with a watermark is the mechanism.
 * Keka webhooks exist and can be added later as an accelerator, but never as
 * the thing the Hub depends on.
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { syncJobs, reconcileJobs } from "@/lib/keka/jobs";
import { sweepPendingPushes, pushEnabled } from "@/lib/keka/candidates";
import { syncReferralStages } from "@/lib/keka/stages";
import { recordedSync } from "@/lib/keka/sync";
import { query } from "@/lib/db";
import { applyBands, type BandApplyResult } from "@/lib/band-apply";
import { isKekaConfigured } from "@/lib/keka/client";

// pg does not run on the edge, and neither does this.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Compare two secrets without leaking their contents through how long the
 * comparison takes. `===` on strings short-circuits at the first differing
 * byte, which over many requests is enough to recover a secret one character
 * at a time. The length is hashed in rather than compared directly, so
 * mismatched lengths do not return early either.
 */
function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still do a comparison of equal-length buffers so the timing does not
    // distinguish "wrong length" from "wrong value".
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();

  // Refuse rather than default-open. An unprotected endpoint that reshapes the
  // jobs table is not something to leave running because a variable is unset.
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;

  return secretsMatch(header.slice("Bearer ".length), secret);
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json(
      { error: process.env.CRON_SECRET?.trim() ? "Unauthorised." : "CRON_SECRET is not set." },
      { status: 401 },
    );
  }

  if (!isKekaConfigured()) {
    return NextResponse.json(
      {
        error:
          "Keka is not configured. Set KEKA_COMPANY, KEKA_CLIENT_ID, " +
          "KEKA_CLIENT_SECRET and KEKA_API_KEY.",
      },
      { status: 503 },
    );
  }

  const full = request.nextUrl.searchParams.get("full") === "1";
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

  // ---- candidate stages -------------------------------------------------
  // Only polls jobs the Hub has referrals against, so this costs nothing
  // until someone has actually referred a person.
  const stages = await recordedSync(
    "candidates",
    async (since) => {
      const r = await syncReferralStages(full ? null : since);
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

  const ok = !jobs.error && !bandError && !stages.error && !reconcileError && !pushError && !rewardError;

  return NextResponse.json(
    {
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
    },
    { status: ok ? 200 : 500 },
  );
}
