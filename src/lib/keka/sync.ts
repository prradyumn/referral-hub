/**
 * Sync bookkeeping.
 *
 * CONTEXT.md convention 10: silence must mean healthy. A run that fails must
 * leave a row saying so, and must not advance the watermark — otherwise the
 * records it missed are skipped forever and the gap is invisible.
 */

import { query, queryOne } from "@/lib/db";

export type SyncResource = "jobs" | "candidates" | "employees";

export type SyncOutcome = {
  read: number;
  written: number;
  /** The watermark the *next* run should start from. */
  watermark: string | null;
};

export type SyncRunRow = {
  id: string;
  integration: string;
  resource: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "failed";
  records_read: number;
  records_written: number;
  error: string | null;
};

/**
 * Run `work` inside a recorded sync run.
 *
 * `work` is handed the watermark from the last *successful* run of this
 * resource, and returns the watermark to store on success.
 */
export async function recordedSync<T extends SyncOutcome>(
  resource: SyncResource,
  work: (since: Date | null) => Promise<T>,
  options: { integration?: string; full?: boolean } = {},
): Promise<{ run: SyncRunRow; result: T | null; error: Error | null }> {
  const integration = options.integration ?? "keka";

  const previous = options.full
    ? null
    : await queryOne<{ watermark: string | null }>(
        `select last_sync_watermark($1, $2) as watermark`,
        [integration, resource],
      );

  const since = previous?.watermark ? new Date(previous.watermark) : null;

  const started = await queryOne<SyncRunRow>(
    `insert into integration_sync_runs (integration, resource, watermark_in)
     values ($1, $2, $3)
     returning *`,
    [integration, resource, since],
  );

  if (!started) throw new Error("Could not open a sync run row.");

  try {
    const result = await work(since);

    const run = await queryOne<SyncRunRow>(
      `update integration_sync_runs
          set status = 'ok', finished_at = now(), watermark_out = $2,
              records_read = $3, records_written = $4
        where id = $1
        returning *`,
      [started.id, result.watermark, result.read, result.written],
    );

    return { run: run ?? started, result, error: null };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));

    // The watermark is deliberately left null on a failed run, so
    // last_sync_watermark() keeps returning the last good one and the next
    // run re-reads the window this one could not finish.
    const run = await queryOne<SyncRunRow>(
      `update integration_sync_runs
          set status = 'failed', finished_at = now(), error = $2
        where id = $1
        returning *`,
      [started.id, error.message.slice(0, 2000)],
    );

    return { run: run ?? started, result: null, error };
  }
}

/**
 * Health, for the integration status screen and for alerting.
 *
 * "Stale" is the condition convention 10 asks us to alert on: no successful
 * run in the last 24 hours. A resource that has *never* run is also stale —
 * an integration that was never switched on should not read as healthy.
 */
export type SyncHealth = {
  resource: string;
  last_success_at: string | null;
  last_status: string | null;
  last_error: string | null;
  is_stale: boolean;
};

export async function syncHealth(integration = "keka"): Promise<SyncHealth[]> {
  return query<SyncHealth>(
    `with latest as (
       select distinct on (resource) resource, status, error, finished_at
         from integration_sync_runs
        where integration = $1
        order by resource, started_at desc
     ),
     succeeded as (
       select distinct on (resource) resource, finished_at
         from integration_sync_runs
        where integration = $1 and status = 'ok'
        order by resource, started_at desc
     )
     select l.resource,
            s.finished_at as last_success_at,
            l.status      as last_status,
            l.error       as last_error,
            (s.finished_at is null or s.finished_at < now() - interval '24 hours')
                          as is_stale
       from latest l
       left join succeeded s on s.resource = l.resource
      order by l.resource`,
    [integration],
  );
}
