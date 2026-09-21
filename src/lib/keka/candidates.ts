/**
 * The Hub → Keka Hire: push a submitted referral as a candidate.
 *
 * The ordering rule that governs this file: the referral is committed to
 * Postgres by submit_referral *before* Keka is ever called. Keka being slow,
 * down, or misconfigured must never cost an employee their referral or their
 * ref code. The push is an enrichment that can be retried; it is never a
 * precondition.
 *
 * That is also why nothing here throws into the submit path. Failures are
 * recorded on the referral row and retried by the sweeper.
 */

import { query, queryOne } from "@/lib/db";
import { kekaRequest, isKekaConfigured, KekaError } from "@/lib/keka/client";
import {
  type PushableReferral,
  candidateBody,
  attributionNote,
  extractCandidateId,
} from "@/lib/keka/map";

export type { PushableReferral } from "@/lib/keka/map";
export {
  splitName,
  splitPhone,
  candidateBody,
  attributionNote,
} from "@/lib/keka/map";

/** How many times to retry a failing push before leaving it for a human. */
const MAX_PUSH_ATTEMPTS = 5;

export type PushResult =
  | { status: "pushed"; kekaCandidateId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string; permanent: boolean };

// ------------------------------------------------------------------ flag
export async function pushEnabled(): Promise<boolean> {
  if (!isKekaConfigured()) return false;
  const row = await queryOne<{ value: string }>(
    `select value from app_settings where key = 'keka_push_candidates'`,
  );
  return row?.value?.trim().toLowerCase() === "true";
}

// ------------------------------------------------------------------ push
export async function pushReferral(r: PushableReferral): Promise<PushResult> {
  if (!r.keka_job_id) {
    return {
      status: "skipped",
      reason:
        "This referral is against a seeded role, which has no Keka job to " +
        "attach a candidate to.",
    };
  }

  let candidateId: string;
  try {
    const created = await kekaRequest<unknown>(
      `/v1/hire/jobs/${encodeURIComponent(r.keka_job_id)}/candidate`,
      { method: "POST", body: candidateBody(r) },
    );
    const found = extractCandidateId(created);
    if (!found) {
      throw new KekaError(
        "Keka accepted the candidate but returned no id we could read.",
        200,
        created,
      );
    }
    candidateId = found;
  } catch (e) {
    const err = e instanceof KekaError ? e : null;
    // 400 is our request being wrong — a field the tenant requires that we do
    // not send. Retrying an identical body will never fix that, so stop.
    const permanent = err?.status === 400 || err?.status === 422;
    return {
      status: "failed",
      error: describe(e),
      permanent: permanent || r.attempts + 1 >= MAX_PUSH_ATTEMPTS,
    };
  }

  // Best effort, and deliberately after the candidate exists. A failed note
  // must not make a successful candidate look like a failed push, or the
  // sweeper will create the candidate a second time.
  try {
    await kekaRequest(
      `/v1/hire/jobs/${encodeURIComponent(r.keka_job_id)}/candidate/${encodeURIComponent(candidateId)}/notes`,
      { method: "POST", body: { note: attributionNote(r) } },
    );
  } catch (e) {
    console.warn(`keka: candidate ${candidateId} created but note failed`, describe(e));
  }

  return { status: "pushed", kekaCandidateId: candidateId };
}

function describe(e: unknown): string {
  if (e instanceof KekaError) {
    const detail =
      typeof e.body === "string"
        ? e.body
        : e.body
          ? JSON.stringify(e.body).slice(0, 600)
          : "";
    return detail ? `${e.message} ${detail}` : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

// ------------------------------------------------------- persistence
const PENDING_SQL = `
  select r.id            as referral_id,
         r.ref_code,
         r.relationship,
         r.keka_push_attempts as attempts,
         j.keka_job_id,
         j.title         as job_title,
         c.full_name     as candidate_name,
         c.email_normalised as candidate_email,
         c.phone_e164    as candidate_phone,
         c.current_org,
         c.current_designation,
         c.linkedin_url,
         e.full_name     as referrer_name,
         e.email         as referrer_email
    from referrals r
    join candidates c on c.id = r.candidate_id
    join jobs       j on j.id = r.job_id
    join employees  e on e.id = r.referrer_id
`;

export async function loadReferralForPush(
  referralId: string,
): Promise<PushableReferral | null> {
  return queryOne<PushableReferral>(
    `${PENDING_SQL} where r.id = $1 and r.keka_candidate_id is null`,
    [referralId],
  );
}

export async function pendingPushes(limit = 25): Promise<PushableReferral[]> {
  return query<PushableReferral>(
    `${PENDING_SQL}
      where r.keka_candidate_id is null
        and j.keka_job_id is not null
        and r.keka_push_attempts < $2
      order by r.submitted_at
      limit $1`,
    [limit, MAX_PUSH_ATTEMPTS],
  );
}

export async function recordPush(
  referralId: string,
  result: PushResult,
): Promise<void> {
  if (result.status === "pushed") {
    await query(
      `update referrals
          set keka_candidate_id = $2, keka_pushed_at = now(), keka_push_error = null
        where id = $1`,
      [referralId, result.kekaCandidateId],
    );
    return;
  }

  if (result.status === "skipped") {
    await query(
      `update referrals set keka_push_error = $2 where id = $1`,
      [referralId, `skipped: ${result.reason}`],
    );
    return;
  }

  await query(
    `update referrals
        set keka_push_attempts = keka_push_attempts + 1,
            keka_push_error    = $2
      where id = $1`,
    [referralId, result.error.slice(0, 2000)],
  );
}

/**
 * Push one referral, swallowing every error.
 *
 * Called from the submit path, where nothing may throw. Anything that fails
 * here is left for the sweeper.
 */
export async function tryPushAfterSubmit(referralId: string): Promise<void> {
  try {
    if (!(await pushEnabled())) return;
    const referral = await loadReferralForPush(referralId);
    if (!referral) return;
    const result = await pushReferral(referral);
    await recordPush(referralId, result);
    if (result.status === "failed") {
      console.warn(`keka: push failed for ${referral.ref_code}: ${result.error}`);
    }
  } catch (e) {
    // Never propagate into the submit path.
    console.error("keka: push threw after submit", e);
  }
}

/** Retry everything still unpushed. Run from the cron route. */
export async function sweepPendingPushes(
  limit = 25,
): Promise<{ read: number; written: number; failed: number }> {
  const pending = await pendingPushes(limit);
  let written = 0;
  let failed = 0;

  for (const referral of pending) {
    const result = await pushReferral(referral);
    await recordPush(referral.referral_id, result);
    if (result.status === "pushed") written++;
    else if (result.status === "failed") failed++;
  }

  return { read: pending.length, written, failed };
}
