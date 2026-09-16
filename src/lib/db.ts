import { Pool } from "pg";

// Vercel runs each function in its own short-lived process, so a large pool per
// instance exhausts Postgres quickly. Keep it small and point DATABASE_URL at
// Supabase's transaction-mode pooler (port 6543), not the direct 5432 port.
declare global {
  // eslint-disable-next-line no-var
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
      "DATABASE_URL is not set. Copy it from Supabase → Project Settings → " +
        "Database → Connection string → Transaction pooler.",
    );
  }

  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false },
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
