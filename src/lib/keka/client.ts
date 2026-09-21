/**
 * Keka API client — OAuth token handling, rate limiting, paging, retry.
 *
 * Node runtime only, like src/lib/db.ts. The `server-only` import below makes
 * that a build error rather than a convention: if any client component ever
 * reaches this module, the build fails instead of quietly bundling the Keka
 * client secret into JavaScript served to the browser.
 *
 * Keka's documented limit is 50 requests per minute, answering 429 with
 * `rateLimitExceeded` when you exceed it. A jobs sync reads one page of jobs
 * and then one page of candidates *per job* — at ~32 open roles that is ~33
 * calls in a burst, which fits under the limit only if nothing else is running.
 * So every call goes through the limiter below rather than trusting the count.
 */

import "server-only";

const TOKEN_MARGIN_MS = 60_000; // refresh a minute before expiry
const RATE_LIMIT_PER_MIN = 45; // 50 documented, kept short of it deliberately
const MAX_ATTEMPTS = 4;
const USER_AGENT = "ConveGenius-ReferralHub/1.0";

export type KekaEnvironment = "production" | "sandbox";

export type KekaConfig = {
  company: string;
  clientId: string;
  clientSecret: string;
  apiKey: string;
  environment: KekaEnvironment;
};

export class KekaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "KekaError";
  }
}

/** Thrown when Keka is not configured at all, as opposed to failing. */
export class KekaNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`Keka is not configured. Missing: ${missing.join(", ")}.`);
    this.name = "KekaNotConfiguredError";
  }
}

// ------------------------------------------------------------------ config
export function kekaConfig(): KekaConfig {
  const env = {
    company: process.env.KEKA_COMPANY,
    clientId: process.env.KEKA_CLIENT_ID,
    clientSecret: process.env.KEKA_CLIENT_SECRET,
    apiKey: process.env.KEKA_API_KEY,
  };

  const missing = Object.entries(env)
    .filter(([, v]) => !v?.trim())
    .map(([k]) => `KEKA_${k.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase()}`);

  if (missing.length) throw new KekaNotConfiguredError(missing);

  const environment: KekaEnvironment =
    process.env.KEKA_ENV === "sandbox" ? "sandbox" : "production";

  return {
    company: env.company!.trim(),
    clientId: env.clientId!.trim(),
    clientSecret: env.clientSecret!.trim(),
    apiKey: env.apiKey!.trim(),
    environment,
  };
}

export function isKekaConfigured(): boolean {
  try {
    kekaConfig();
    return true;
  } catch {
    return false;
  }
}

function hosts(cfg: KekaConfig) {
  // Sandbox lives on a separate domain entirely, not a path on the same one.
  const domain = cfg.environment === "sandbox" ? "kekademo.com" : "keka.com";
  return {
    token: `https://login.${domain}/connect/token`,
    api: `https://${cfg.company}.${domain}/api`,
  };
}

// ------------------------------------------------------------- rate limit
// A sliding window over the last 60 seconds. Held on globalThis so that
// separate imports in one process share it; in a serverless instance this is
// per-instance, which errs towards being slower than necessary rather than
// towards a 429.
declare global {
  var __kekaCalls: number[] | undefined;
  var __kekaToken: { value: string; expiresAt: number } | undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(): Promise<void> {
  globalThis.__kekaCalls ??= [];
  const calls = globalThis.__kekaCalls;

  for (;;) {
    const cutoff = Date.now() - 60_000;
    // Drop everything older than the window.
    while (calls.length && calls[0] < cutoff) calls.shift();

    if (calls.length < RATE_LIMIT_PER_MIN) {
      calls.push(Date.now());
      return;
    }

    // Wait until the oldest call leaves the window.
    await sleep(Math.max(250, calls[0] - cutoff + 50));
  }
}

// ----------------------------------------------------------------- token
/**
 * A cached access token.
 *
 * Keka does not document the token lifetime, so we trust `expires_in` when it
 * is present and fall back to a conservative ten minutes when it is not.
 */
async function accessToken(cfg: KekaConfig): Promise<string> {
  const cached = globalThis.__kekaToken;
  if (cached && cached.expiresAt > Date.now() + TOKEN_MARGIN_MS) {
    return cached.value;
  }

  const body = new URLSearchParams({
    grant_type: "kekaapi",
    scope: "kekaapi",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    api_key: cfg.apiKey,
  });

  await throttle();
  const res = await fetch(hosts(cfg).token, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      // Keka's docs warn that requests without a User-Agent are rejected
      // from non-browser clients.
      "user-agent": USER_AGENT,
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    // Never log the body verbatim at call sites: it echoes the request.
    throw new KekaError(
      `Keka token request failed (${res.status}). Check KEKA_CLIENT_ID, ` +
        `KEKA_CLIENT_SECRET and KEKA_API_KEY, and that the key is enabled ` +
        `for the scopes this integration needs.`,
      res.status,
      safeJson(text),
    );
  }

  const json = safeJson(text) as { access_token?: string; expires_in?: number };
  if (!json?.access_token) {
    throw new KekaError("Keka returned no access_token.", res.status, json);
  }

  const ttlMs = (json.expires_in ?? 600) * 1000;
  globalThis.__kekaToken = {
    value: json.access_token,
    expiresAt: Date.now() + ttlMs,
  };
  return json.access_token;
}

/** Drop the cached token. Used when a call comes back 401 mid-run. */
export function forgetKekaToken(): void {
  globalThis.__kekaToken = undefined;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ------------------------------------------------------------------ fetch
type RequestOptions = {
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** Set false to surface a 404 as null instead of throwing. */
  throwOnNotFound?: boolean;
};

export async function kekaRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const cfg = kekaConfig();
  const { method = "GET", query, body, throwOnNotFound = true } = options;

  const url = new URL(hosts(cfg).api + (path.startsWith("/") ? path : `/${path}`));
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await throttle();

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${await accessToken(cfg)}`,
          accept: "application/json",
          "user-agent": USER_AGENT,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      // Network-level failure. Worth one more try.
      lastError = e;
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(backoff(attempt));
      continue;
    }

    if (res.status === 404 && !throwOnNotFound) {
      return null as T;
    }

    // A token can expire mid-run, or be revoked. Retry once with a fresh one.
    if (res.status === 401 && attempt < MAX_ATTEMPTS) {
      forgetKekaToken();
      await sleep(backoff(attempt));
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      lastError = new KekaError(
        res.status === 429
          ? "Keka rate limit exceeded."
          : `Keka server error (${res.status}).`,
        res.status,
      );
      if (attempt === MAX_ATTEMPTS) break;
      // Honour Retry-After when Keka sends it; otherwise back off.
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : backoff(attempt),
      );
      continue;
    }

    const text = await res.text();
    const parsed = safeJson(text);

    if (!res.ok) {
      throw new KekaError(
        `Keka ${method} ${path} failed (${res.status}).`,
        res.status,
        parsed,
      );
    }

    return parsed as T;
  }

  if (lastError instanceof KekaError) throw lastError;
  throw new KekaError(
    `Keka ${method} ${path} failed after ${MAX_ATTEMPTS} attempts.`,
    0,
    lastError instanceof Error ? lastError.message : lastError,
  );
}

function backoff(attempt: number): number {
  // 1s, 2s, 4s with a little jitter so parallel workers do not resynchronise.
  return 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
}

// -------------------------------------------------------------- pagination
/**
 * Keka wraps list responses in an envelope carrying the page and the totals.
 * The documented terminator is a null next-page reference; the field names
 * vary a little across their endpoints, so this reads defensively and also
 * stops on an empty page or on totalPages.
 */
type Envelope<T> = {
  succeeded?: boolean;
  data?: T[];
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
  totalRecords?: number;
  nextPage?: string | null;
};

const MAX_PAGES = 200; // a stop, so a malformed envelope cannot loop forever

export async function kekaList<T>(
  path: string,
  query: Record<string, string | number | boolean | undefined | null> = {},
  pageSize = 200, // Keka's documented maximum
): Promise<T[]> {
  const out: T[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await kekaRequest<Envelope<T> | T[]>(path, {
      query: { ...query, pageNumber: page, pageSize },
    });

    // Some endpoints return a bare array rather than the envelope.
    const rows = Array.isArray(body) ? body : (body?.data ?? []);
    out.push(...rows);

    if (Array.isArray(body)) break;
    if (rows.length === 0) break;
    if (body?.nextPage === null) break;
    if (body?.totalPages !== undefined && page >= body.totalPages) break;
    if (rows.length < pageSize && body?.totalPages === undefined) break;
  }

  return out;
}
