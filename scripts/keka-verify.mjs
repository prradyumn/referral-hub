/**
 * Verifies the Keka credential and audits what it can reach.
 *
 *   npm run keka:verify
 *
 * Two jobs:
 *
 *   1. Prove the credential works at all, and say precisely which part is
 *      wrong when it does not.
 *   2. **Audit least privilege.** Probe every Keka module and report which
 *      ones this key can read. The Referral Hub needs recruitment, and later
 *      a little of HRIS and payroll. If the key can also read salaries,
 *      attendance, documents or performance reviews, it is over-granted — and
 *      that is exactly the finding you want *before* the key goes into Vercel,
 *      not after.
 *
 * Read-only. It requests one record per endpoint, prints no employee or
 * candidate data, and writes nothing anywhere.
 */

const need = ["KEKA_COMPANY", "KEKA_CLIENT_ID", "KEKA_CLIENT_SECRET", "KEKA_API_KEY"];
const missing = need.filter((k) => !process.env[k]?.trim());
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  console.error("\nRun  npm run env:set  to enter them safely.");
  process.exit(1);
}

const SANDBOX = process.env.KEKA_ENV === "sandbox";
const DOMAIN = SANDBOX ? "kekademo.com" : "keka.com";
const COMPANY = process.env.KEKA_COMPANY.trim();
const API = `https://${COMPANY}.${DOMAIN}/api`;
const UA = "ConveGenius-ReferralHub/1.0";

// Never print a secret. Enough to tell two keys apart in a support thread,
// not enough to use.
const fingerprint = (v) => `${v.slice(0, 3)}…${v.slice(-2)} (${v.length} chars)`;

console.log(`\ntenant       ${COMPANY}.${DOMAIN}`);
console.log(`environment  ${SANDBOX ? "SANDBOX" : "PRODUCTION"}`);
console.log(`client id    ${fingerprint(process.env.KEKA_CLIENT_ID.trim())}`);
console.log(`secret       ${fingerprint(process.env.KEKA_CLIENT_SECRET.trim())}`);
console.log(`api key      ${fingerprint(process.env.KEKA_API_KEY.trim())}`);

// Catch the mistakes that produce confusing errors later.
const warnings = [];
for (const k of need) {
  const v = process.env[k];
  if (v !== v.trim()) warnings.push(`${k} has leading or trailing whitespace.`);
  if (/[.,;:]$/.test(v.trim())) {
    warnings.push(`${k} ends in punctuation — a full stop copied out of prose is a known trap (CONTEXT.md §8).`);
  }
}
if (COMPANY.includes(".")) {
  warnings.push(`KEKA_COMPANY is "${COMPANY}" — it should be the subdomain only, e.g. "acme", not "acme.keka.com".`);
}
if (warnings.length) {
  console.log("\nwarnings:");
  for (const w of warnings) console.log(`  ! ${w}`);
}

// ------------------------------------------------------------------ token
console.log("\n── credential ──────────────────────────────────────────────");

const tokenRes = await fetch(`https://login.${DOMAIN}/connect/token`, {
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
  const text = await tokenRes.text();
  console.log(`  FAILED  ${tokenRes.status}`);
  console.log(`  ${text.slice(0, 300)}`);
  console.log(
    "\n  invalid_client        → client_id or client_secret is wrong or incomplete\n" +
    "  unsupported_grant_type → grant_type must be kekaapi, not client_credentials\n" +
    "  invalid_scope          → scope must be kekaapi\n" +
    "  anything mentioning the api key → KEKA_API_KEY is wrong\n" +
    "\n  All three values come from the same Keka screen and all three are required.",
  );
  process.exit(1);
}

const token = await tokenRes.json();
const hours = Math.round((token.expires_in ?? 0) / 3600);
console.log(`  ok      token issued, valid ${hours}h, scope "${token.scope ?? "?"}"`);

// ------------------------------------------------------------------ probes
// Each probe asks for a single record. `need` says whether the Referral Hub
// has any business reading it.
const PROBES = [
  // Every Keka module sits under /v1 — including the ones whose documentation
  // URLs omit it. Probing without the prefix returns 404, which is "wrong
  // path", not "access denied", and reading it as the latter produces a
  // falsely reassuring least-privilege result.
  { module: "Recruitment — jobs",        path: "/v1/hire/jobs",                    need: "required" },
  { module: "Recruitment — job boards",  path: "/v1/hire/jobboards",               need: "optional" },
  { module: "Recruitment — preboarding", path: "/v1/hire/preboarding/candidates",  need: "optional" },
  { module: "HRIS employees",            path: "/v1/hris/employees",               need: "phase 1" },
  { module: "HRIS departments",          path: "/v1/hris/departments",             need: "phase 1" },
  { module: "Payroll bonus types",       path: "/v1/payroll/bonustypes",           need: "phase 1" },
  { module: "Payroll salaries",          path: "/v1/payroll/salaries",             need: "NOT NEEDED" },
  { module: "HRIS documents",            path: "/v1/hris/documents/types",         need: "NOT NEEDED" },
  { module: "Attendance",                path: "/v1/time/attendance",              need: "NOT NEEDED" },
  { module: "Leave",                     path: "/v1/time/leavetypes",              need: "NOT NEEDED" },
  { module: "Expenses",                  path: "/v1/expense/categories",           need: "NOT NEEDED" },
  { module: "Performance",               path: "/v1/pms/goals",                    need: "NOT NEEDED" },
  { module: "Assets",                    path: "/v1/assets",                       need: "NOT NEEDED" },
  { module: "Helpdesk",                  path: "/v1/helpdesk/tickets",             need: "NOT NEEDED" },
  { module: "Projects (PSA)",            path: "/v1/psa/projects",                 need: "NOT NEEDED" },
];

console.log("\n── what this key can reach ─────────────────────────────────");
console.log("  (one record requested per endpoint; no data is printed)\n");
console.log("  access  needed by hub  module");
console.log("  ------  --------------  ------");

const calls = [];
const results = [];

for (const probe of PROBES) {
  // Stay well inside the 50/min limit.
  const now = Date.now();
  while (calls.length && calls[0] < now - 60_000) calls.shift();
  if (calls.length >= 40) await new Promise((r) => setTimeout(r, 2000));
  calls.push(Date.now());

  let status;
  try {
    const res = await fetch(`${API}${probe.path}?pageNumber=1&pageSize=1`, {
      headers: {
        authorization: `Bearer ${token.access_token}`,
        accept: "application/json",
        "user-agent": UA,
      },
    });
    status = res.status;
  } catch {
    status = 0;
  }

  const granted = status === 200;
  const denied = status === 401 || status === 403;
  // A 404 means the path is wrong, NOT that access is denied. Counting it as
  // denied would report least privilege that has not actually been checked.
  const unknown = !granted && !denied;
  const label =
    granted ? "YES" :
    denied ? "no" :
    status === 404 ? "404?" :
    String(status);

  results.push({ ...probe, status, granted, denied, unknown });
  console.log(
    `  ${label.padEnd(6)}  ${probe.need.padEnd(14)}  ${probe.module}`,
  );
}

// ------------------------------------------------------------------ verdict
console.log("\n── verdict ─────────────────────────────────────────────────\n");

let exitCode = 0;

const required = results.filter((r) => r.need === "required");
const missingRequired = required.filter((r) => !r.granted);

if (missingRequired.length) {
  exitCode = 1;
  console.log("  BLOCKED — the key authenticated but cannot read what the Hub needs:\n");
  for (const r of missingRequired) {
    console.log(`      · ${r.module}  →  HTTP ${r.status}`);
  }
  console.log(
    "\n    A 401 or 403 here with a working token means the key exists but was\n" +
    "    not granted the recruitment scopes. In Keka: Global admin settings →\n" +
    "    Integrations & Automations → API access → your key → add the\n" +
    "    recruitment privileges. Only a Global admin can change this.",
  );
} else {
  console.log("  ✓ Recruitment access works. The jobs sync can run.");
}

const unknowns = results.filter((r) => r.unknown);
if (unknowns.length) {
  console.log(
    `\n  ? ${unknowns.length} endpoint(s) answered 404 — the path is wrong, so\n` +
    "    access to them was NOT checked. This is a gap in this script, not a\n" +
    "    finding about your key:\n",
  );
  for (const r of unknowns) console.log(`      · ${r.module}  (${r.path})`);
}

const overGranted = results.filter((r) => r.need === "NOT NEEDED" && r.granted);
if (overGranted.length) {
  console.log(
    `\n  ⚠ OVER-GRANTED — this key can also read ${overGranted.length} module(s)\n` +
    `    the Referral Hub never touches:\n`,
  );
  for (const r of overGranted) console.log(`      · ${r.module}`);
  console.log(
    "\n    A referral tool holding a key that can read salaries, documents or\n" +
    "    attendance widens the blast radius of a leak for no benefit. Narrow\n" +
    "    the scopes in Keka (Global admin settings → Integrations &\n" +
    "    Automations → API access), then re-run this.",
  );
} else {
  const checked = results.filter((r) => r.need === "NOT NEEDED" && r.denied).length;
  const total = results.filter((r) => r.need === "NOT NEEDED").length;
  console.log(
    checked === total
      ? "\n  ✓ Least privilege: every module the Hub does not use is denied."
      : `\n  ~ Least privilege: ${checked}/${total} unneeded modules confirmed denied; ` +
        "the rest were not conclusively checked (see above).",
  );
}

const phase1 = results.filter((r) => r.need === "phase 1");
const phase1Granted = phase1.filter((r) => r.granted).length;
console.log(
  `\n  Phase 1 modules reachable: ${phase1Granted}/${phase1.length} ` +
  `(HRIS and payroll — not needed yet, fine either way).`,
);

console.log("\n  Nothing was written. Next:  npm run keka:discover\n");
process.exit(exitCode);
