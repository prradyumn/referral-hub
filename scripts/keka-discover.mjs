/**
 * Read-only reconnaissance of a Keka tenant.
 *
 *   node --env-file=.env.local scripts/keka-discover.mjs
 *   node --env-file=.env.local scripts/keka-discover.mjs --json > keka.json
 *
 * Makes no writes to Keka and none to Postgres. It exists because three things
 * the integration needs are not in Keka's documentation and can only be learned
 * from a real tenant:
 *
 *   1. Which JobStatus integers mean "open"       → app_settings.keka_open_job_statuses
 *   2. The jobHiringStageId values and their order → keka_stage_map
 *   3. The per-job application fields, and which are required → the candidate push
 *
 * Run this before turning either sync on, and again whenever Keka's hiring
 * pipeline is reconfigured.
 *
 * It deliberately prints no candidate names, emails or phone numbers. Stage
 * ids and counts are all the mapping needs, and this output tends to get
 * pasted into chat threads.
 */

const JSON_ONLY = process.argv.includes("--json");
const log = (...a) => { if (!JSON_ONLY) console.log(...a); };

const need = ["KEKA_COMPANY", "KEKA_CLIENT_ID", "KEKA_CLIENT_SECRET", "KEKA_API_KEY"];
const missing = need.filter((k) => !process.env[k]?.trim());
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  console.error(
    "\nGet them from Keka: Global admin settings → Integrations & Automations\n" +
    "→ API access → API key. Only a Global admin can issue them.",
  );
  process.exit(1);
}

const SANDBOX = process.env.KEKA_ENV === "sandbox";
const DOMAIN = SANDBOX ? "kekademo.com" : "keka.com";
const TOKEN_URL = `https://login.${DOMAIN}/connect/token`;
const API = `https://${process.env.KEKA_COMPANY.trim()}.${DOMAIN}/api`;
const UA = "ConveGenius-ReferralHub/1.0";

log(`tenant:      ${process.env.KEKA_COMPANY.trim()}.${DOMAIN}`);
log(`environment: ${SANDBOX ? "SANDBOX" : "PRODUCTION (read-only)"}\n`);

// ------------------------------------------------------------------ token
const tokenRes = await fetch(TOKEN_URL, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
  body: new URLSearchParams({
    grant_type: "kekaapi",
    scope: "kekaapi",
    client_id: process.env.KEKA_CLIENT_ID.trim(),
    client_secret: process.env.KEKA_CLIENT_SECRET.trim(),
    api_key: process.env.KEKA_API_KEY.trim(),
  }),
});

if (!tokenRes.ok) {
  console.error(`Token request failed: ${tokenRes.status}`);
  console.error(await tokenRes.text());
  console.error(
    "\nA trailing full stop copied along with a secret is the classic cause —\n" +
    "see CONTEXT.md §8. Check the values are exactly as Keka issued them.",
  );
  process.exit(1);
}

const { access_token, expires_in } = await tokenRes.json();
log(`token ok, expires in ${Math.round((expires_in ?? 0) / 3600)}h\n`);

// ------------------------------------------------------------- rate limit
// 50/min documented. Sequential with a small gap is plenty for a diagnostic.
const calls = [];
async function get(path, query = {}) {
  const now = Date.now();
  while (calls.length && calls[0] < now - 60_000) calls.shift();
  if (calls.length >= 45) {
    await new Promise((r) => setTimeout(r, calls[0] - (now - 60_000) + 100));
  }
  calls.push(Date.now());

  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${access_token}`, accept: "application/json", "user-agent": UA },
  });

  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }

  if (!res.ok) {
    const err = new Error(`GET ${path} → ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

const rows = (b) => (Array.isArray(b) ? b : (b?.data ?? []));

// ------------------------------------------------------------------- jobs
// Page through. The first run of this script read only page one and reported
// 200 jobs, which is exactly the page-size cap — a truncated sample dressed up
// as a total, and the status breakdown drawn from it was wrong.
async function listAll(path, query = {}) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const body = await get(path, { ...query, pageNumber: page, pageSize: 200 });
    const batch = rows(body);
    out.push(...batch);
    if (Array.isArray(body)) break;
    if (batch.length === 0) break;
    if (body?.nextPage == null) break;
    if (body?.totalPages !== undefined && page >= body.totalPages) break;
  }
  return out;
}

let jobs = [];
try {
  jobs = await listAll("/v1/hire/jobs");
} catch (e) {
  console.error(`\nCould not list jobs: ${e.message}`);
  if (e.status === 401 || e.status === 403) {
    console.error(
      "The credential authenticated but is not authorised for Keka Hire.\n" +
      "In Keka, add the recruitment scopes to this API key.",
    );
  }
  process.exit(1);
}

log(`── jobs ──────────────────────────────────────────  ${jobs.length} total\n`);

// The thing we came for: which status integers exist, and what they look like.
const byStatus = new Map();
for (const j of jobs) {
  const k = j.status ?? "(none)";
  if (!byStatus.has(k)) byStatus.set(k, []);
  byStatus.get(k).push(j);
}

log("status  count  referral-enabled  example title");
log("------  -----  ----------------  -------------");
for (const [status, list] of [...byStatus.entries()].sort()) {
  const enabled = list.filter((j) => j.isReferralEnabled).length;
  log(
    String(status).padEnd(6),
    String(list.length).padStart(5),
    `${enabled}/${list.length}`.padStart(16),
    " ",
    (list[0].title ?? "").slice(0, 46),
  );
}

log(
  `\n→ Set app_settings.keka_open_job_statuses to the status value(s) above\n` +
  `  that mean "open and hiring". Anything not listed is treated as closed.`,
);

const referable = jobs.filter((j) => j.isReferralEnabled);
log(`\n${referable.length} of ${jobs.length} jobs have isReferralEnabled = true.`);
if (referable.length === 0) {
  log(
    "  None. The Hub shows roles only where Keka has referrals enabled, so\n" +
    "  /roles would be empty. Enable referrals on the roles HR wants referred.",
  );
}

// Field coverage: which of our columns Keka actually populates.
const coverage = (field, fn) => {
  const n = jobs.filter(fn).length;
  return `${field.padEnd(22)} ${String(n).padStart(4)}/${jobs.length}`;
};
log("\nfield coverage across returned jobs:");
log("  " + coverage("title", (j) => j.title?.trim()));
log("  " + coverage("departmentName", (j) => j.departmentName?.trim()));
log("  " + coverage("jobLocations", (j) => j.jobLocations?.length));
log("  " + coverage("experience", (j) => j.experience));
log("  " + coverage("orgJobId", (j) => j.orgJobId?.trim()));
log("  " + coverage("description", (j) => j.description?.trim()));
log("  " + coverage("publishedOn", (j) => j.publishedOn));

// ----------------------------------------------- application fields + stages
// Sampled rather than exhaustive: one call per job would burn the rate limit
// on a big tenant, and the shape rarely differs across roles.
const SAMPLE = Number(process.env.KEKA_DISCOVER_SAMPLE ?? 5);
const sample = (referable.length ? referable : jobs).slice(0, SAMPLE);

log(`\n── application fields ────────────────  sampling ${sample.length} job(s)\n`);

const fieldsByJob = {};
for (const job of sample) {
  try {
    const fields = rows(await get(`/v1/hire/jobs/${job.id}/applicationfields`));
    fieldsByJob[job.id] = fields;
    const required = fields.filter((f) => f.required);
    log(`  ${(job.title ?? job.id).slice(0, 44)}`);
    log(`    ${fields.length} fields, ${required.length} required`);
    for (const f of required) {
      log(`      · ${f.fieldName}  (type ${f.fieldType}, id ${f.id})`);
    }
  } catch (e) {
    log(`  ${(job.title ?? job.id).slice(0, 44)} — fields unavailable: ${e.message}`);
  }
}

log(
  "\n→ Every REQUIRED field above must be satisfiable from the Hub's referral\n" +
  "  form, or the candidate push will be rejected. Anything the form does not\n" +
  "  collect has to be added to the form or given a default.",
);

log(`\n── hiring stages ─────────────────────  sampling ${sample.length} job(s)\n`);

const stages = new Map();
let candidateCount = 0;
for (const job of sample) {
  try {
    const cands = await listAll(`/v1/hire/jobs/${job.id}/candidates`);
    candidateCount += cands.length;
    for (const c of cands) {
      const d = c.jobApplicationDetails ?? {};
      const id = d.jobHiringStageId;
      if (!id) continue;
      if (!stages.has(id)) stages.set(id, { id, count: 0, statuses: new Set(), sources: new Set() });
      const s = stages.get(id);
      s.count++;
      if (d.status !== undefined) s.statuses.add(d.status);
      if (d.sourceTitle) s.sources.add(d.sourceTitle);
    }
  } catch (e) {
    log(`  candidates unavailable for ${(job.title ?? job.id).slice(0, 40)}: ${e.message}`);
  }
}

log(`${candidateCount} candidate records seen, ${stages.size} distinct stage id(s).\n`);
if (stages.size) {
  log("count  applicationStatus  stage id");
  log("-----  -----------------  --------");
  for (const s of [...stages.values()].sort((a, b) => b.count - a.count)) {
    log(
      String(s.count).padStart(5),
      `[${[...s.statuses].join(",")}]`.padStart(17),
      " ",
      s.id,
    );
  }
  log(
    "\n→ Insert one keka_stage_map row per id above, with the wording the\n" +
    "  employee should read. Until a row exists the stage is stored but never\n" +
    "  shown — the Hub will not invent a label for a stage it does not know.",
  );

  const allSources = new Set();
  for (const s of stages.values()) for (const src of s.sources) allSources.add(src);
  if (allSources.size) {
    log(`\nsourceTitle values in use: ${[...allSources].join(", ")}`);
    log(
      "→ This is the closest thing Keka documents to a referral marker. Check\n" +
      "  whether one of these is the value HR expects referrals to carry.",
    );
  }
} else {
  log(
    "No candidates in the sampled jobs, so no stage ids to map yet.\n" +
    "Re-run once there are applicants, or sample more jobs with\n" +
    "KEKA_DISCOVER_SAMPLE=20.",
  );
}

if (JSON_ONLY) {
  console.log(JSON.stringify({
    tenant: `${process.env.KEKA_COMPANY.trim()}.${DOMAIN}`,
    jobCount: jobs.length,
    statuses: [...byStatus.entries()].map(([status, l]) => ({
      status,
      count: l.length,
      referralEnabled: l.filter((j) => j.isReferralEnabled).length,
    })),
    applicationFields: fieldsByJob,
    stages: [...stages.values()].map((s) => ({
      id: s.id, count: s.count,
      statuses: [...s.statuses], sources: [...s.sources],
    })),
  }, null, 2));
} else {
  log("\ndone — nothing was written, to Keka or to Postgres.");
}
