// CONTEXT.md has warned since Phase 0 that this module is Node-runtime only
// and must never be imported by a client component. This makes that a build
// error rather than a note: DATABASE_URL contains the database password.
import "server-only";

import { Pool } from "pg";

// Vercel runs each function in its own short-lived process, so a large pool per
// instance exhausts Postgres quickly. Keep it small, and if your provider offers
// a connection pooler (Neon's pooled host, PgBouncer), point DATABASE_URL at it
// rather than the direct connection.
declare global {
  var __referralHubPool: Pool | undefined;
}

// Built on first query, never at import. `next build` imports every module to
// collect page data, and a pool constructed at module scope would fail the
// build on any machine without DATABASE_URL set — including Vercel's builder.
function getPool(): Pool {
  if (globalThis.__referralHubPool) return globalThis.__referralHubPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Set it to your Postgres connection string.",
    );
  }

  const pool = new Pool({
    // Neon presents a valid certificate, so the connection is fully verified.
    //
    // This used to pass `ssl: { rejectUnauthorized: false }`, which encrypts
    // the connection but accepts any certificate — no protection against an
    // interception. Verified on 21 Sep 2026 that Neon works with full
    // verification, so there was nothing being bought by turning it off.
    //
    // `sslmode=require` is rewritten to `verify-full` because pg treats them
    // as the same today and warns that a future major version will not: under
    // libpq semantics `require` encrypts without verifying. Saying what we
    // mean now keeps the behaviour when that changes.
    connectionString: connectionString.replace(
      /([?&])sslmode=(require|prefer|verify-ca)\b/gi,
      "$1sslmode=verify-full",
    ),
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  globalThis.__referralHubPool = pool;
  return pool;
}

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

export async function queryOne<T>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export type Tx = {
  query<T>(text: string, params?: unknown[]): Promise<T[]>;
  queryOne<T>(text: string, params?: unknown[]): Promise<T | null>;
};

/**
 * Runs `fn` in one transaction on one connection, committing if it returns
 * and rolling back if it throws.
 *
 * Safe on Neon's pooled endpoint: in transaction mode the pooler pins a
 * server connection for the life of a transaction, which is also what keeps
 * submit_referral's pg_advisory_xact_lock meaningful.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  const tx: Tx = {
    async query<R>(text: string, params: unknown[] = []) {
      return (await client.query(text, params)).rows as R[];
    },
    async queryOne<R>(text: string, params: unknown[] = []) {
      return ((await client.query(text, params)).rows[0] as R | undefined) ?? null;
    },
  };

  try {
    await client.query("begin");
    const result = await fn(tx);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
