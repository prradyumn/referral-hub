/**
 * One job's candidates, fetched once per sync run however many readers want them.
 *
 * The stage sync and the Keka-referral import both read
 * /v1/hire/jobs/{id}/candidates for the same jobs. Fetched separately, the two
 * would pass the cron's 300-second ceiling as referrals spread across roles:
 * 57 open jobs × active and archived is 114 calls for each, against a limit
 * of 50 a minute. Sharing one fetch keeps a run bounded by the number of open
 * jobs, not by how many readers there are.
 */

import { kekaList } from "@/lib/keka/client";

export type CandidateCache = Map<string, Promise<unknown[]>>;

export function newCandidateCache(): CandidateCache {
  return new Map();
}

export async function jobCandidates<T>(
  jobId: string,
  since: Date | null | undefined,
  cache?: CandidateCache,
): Promise<T[]> {
  // Keyed on the window too: an incremental read is not a full one.
  const key = `${jobId}|${since ? since.toISOString() : "all"}`;
  const cached = cache?.get(key);
  if (cached) return (await cached) as T[];

  const pending = fetchBoth(jobId, since);
  cache?.set(key, pending);
  try {
    return (await pending) as T[];
  } catch (e) {
    cache?.delete(key); // a failure must not be served to the next reader
    throw e;
  }
}

async function fetchBoth(jobId: string, since: Date | null | undefined): Promise<unknown[]> {
  const path = `/v1/hire/jobs/${encodeURIComponent(jobId)}/candidates`;
  // ISO on the way in; Keka rejects epoch here with a 400. See §16.
  const window = { lastModified: since ? since.toISOString() : undefined };

  // Active and archived both. Keka hides archived candidates unless asked
  // (isArchived defaults to false), and archiving is how a candidate is
  // taken out of the process. Pulling active only meant a rejected referral
  // stayed on its last stage in the Hub forever — the employee would watch
  // "Interviewing" for months and never learn it had closed.
  const [active, archived] = await Promise.all([
    kekaList<unknown>(path, window),
    kekaList<unknown>(path, { ...window, isArchived: true }),
  ]);
  return [...active, ...archived];
}
