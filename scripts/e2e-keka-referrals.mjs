/**
 * Referrals made in Keka, brought into the Hub — end to end.
 *
 *   node --env-file=.env.local scripts/e2e-keka-referrals.mjs   (dev server running)
 *
 * No Keka credentials needed: this feeds the database the rows the sync
 * produces from Keka, then drives the admin screen in a browser. What Keka
 * returns is covered by keka-attribution-check.mjs and, against a real
 * tenant, only by a run with credentials — see CONTEXT.md §26.
 *
 * Proves: a configured-field match credits automatically; running twice
 * creates nothing twice; a referrer who never signed in still gets credit; a
 * name-only referral waits for an admin; a Hub referral is recognised rather
 * than duplicated; a race loses cleanly; a non-work address is refused; an
 * imported referral is never pushed back to Keka or shown to TA as waiting;
 * the stage sync then tracks it; the admin can credit and dismiss; a
 * non-admin cannot see the page; the referrer sees it, marked as from Keka.
 *
 * Creates temporary employees, jobs rows are real but untouched, and every
 * referral, candidate, staging row and employee it made is deleted after.
 */

import { chromium } from "@playwright/test";
import { encode } from "next-auth/jwt";
import pg from "pg";

const BASE = process.env.SHOOT_BASE ?? "http://localhost:3000";
const COOKIE = "authjs.session-token";
const RUN = Date.now();
const REFERRER = `e2e_kr_ref_${RUN}@convegenius.ai`;
const ADMIN = `e2e_kr_adm_${RUN}@convegenius.ai`;
const OTHER = `e2e_kr_oth_${RUN}@convegenius.ai`;
const NEWBIE = `e2e_kr_new_${RUN}@convegenius.ai`;
const APPLIED = "2026-09-25T06:00:00.000Z";

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0] ?? null;
const all = async (sql, p = []) => (await db.query(sql, p)).rows;

const job = await one(
  `select id, keka_job_id from jobs where is_open and keka_referral_enabled and keka_job_id is not null order by keka_job_id limit 1`,
);
if (!job) {
  console.log("No open, referral-enabled Keka job to test against.");
  process.exit(1);
}

const emp = Object.fromEntries(
  (
    await all(
      `insert into employees (email, full_name, is_admin, welcome_ack_at)
       values ($1, 'ZZ Referrer Person', false, now()), ($2, 'ZZ KR Admin', true, now()),
              ($3, 'ZZ Other Person', false, now())
       returning id, email`,
      [REFERRER, ADMIN, OTHER],
    )
  ).map((r) => [r.email, r.id]),
);

const cand = (n) => `zz-keka-${RUN}-${n}@example.invalid`;
const phone = (n) => `8${String(RUN).slice(-7)}${String(n).padStart(2, "0")}`;
const row = (n, extra = {}) => ({
  keka_job_id: job.keka_job_id,
  keka_candidate_id: `e2e-${RUN}-${n}`,
  full_name: `ZZ Keka ${n} ${RUN}`,
  email: cand(n),
  phone: phone(n),
  sourced_by: "",
  referrer_email: "",
  referrer_hint: "",
  fields_seen: ["Notice period", "Referrer work email"],
  applied_on: APPLIED,
  suggested_employee_id: "",
  ...extra,
});
const upsert = (rows) => all(`select * from upsert_keka_referral_candidates($1::jsonb)`, [JSON.stringify(rows)]);
const credit = async (id, email, actor = null) =>
  (await one(`select credit_keka_referral($1, $2, $3) as s`, [id, email, actor])).s;
const staged = (n) => one(`select * from keka_referral_candidates where keka_candidate_id = $1`, [`e2e-${RUN}-${n}`]);
const referralsFor = (email) =>
  all(
    `select r.* from referrals r join candidates c on c.id = r.candidate_id where c.email_normalised = $1`,
    [email],
  );
const hubReferral = (referrerId, n) =>
  one(`select * from submit_referral($1,$2,$3,$4,$5,null,null,null,'Friend','e2e consent')`, [
    referrerId, job.id, `ZZ Hub ${n} ${RUN}`, cand(n), phone(n),
  ]);

const browser = await chromium.launch();
async function contextFor(email) {
  const token = await encode({
    token: { name: email, email, sub: email, exp: Math.floor(Date.now() / 1000) + 3600 },
    secret: process.env.AUTH_SECRET,
    salt: COOKIE,
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addCookies([{ name: COOKIE, value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  return ctx;
}

try {
  console.log("\nCredited automatically from the configured field");
  const ready = await upsert([row(1, { referrer_email: REFERRER })]);
  const r1 = await staged(1);
  check(ready.some((x) => x.out_row_id === r1.id), "a referrer email makes it ready to credit");
  check((await credit(r1.id, REFERRER)) === "credited", "credit_keka_referral credits it");
  const [ref1] = await referralsFor(cand(1));
  check(ref1?.referrer_id === emp[REFERRER], "to the referrer named in Keka");
  check(ref1?.origin === "keka", "marked as made in Keka");
  check(ref1?.keka_candidate_id === `e2e-${RUN}-1`, "keka_candidate_id set — so the push sweeper will never send it back");
  check(ref1?.keka_last_seen_at !== null, "keka_last_seen_at set — so TA's inbox does not ask for it");
  check(new Date(ref1?.keka_applied_on).toISOString() === APPLIED, "the Keka referral date is kept");
  const hubStage = await one(`select occurred_at from referral_stages where referral_id = $1 and source = 'hub'`, [ref1.id]);
  check(new Date(hubStage?.occurred_at).toISOString() === APPLIED, "its journey starts when it was made in Keka, not when imported");
  check(
    (await one(`select count(*)::int n from referrals where id = $1 and ta_added_at is null and keka_last_seen_at is null`, [ref1.id])).n === 0,
    "absent from the TA inbox query",
  );
  check(
    (await one(`select count(*)::int n from referrals where id = $1 and keka_candidate_id is null`, [ref1.id])).n === 0,
    "absent from the push sweeper's query",
  );

  console.log("\nRunning twice creates nothing twice");
  await upsert([row(1, { referrer_email: REFERRER, full_name: `ZZ Keka 1 renamed ${RUN}` })]);
  check((await credit(r1.id, REFERRER)) === "credited", "a second credit is a no-op");
  check((await referralsFor(cand(1))).length === 1, "still exactly one referral");
  const again = await staged(1);
  check(again.status === "credited" && again.full_name.includes("renamed"), "Keka's facts refresh; the decision stays");

  console.log("\nA referrer who has never signed in");
  await upsert([row(2, { referrer_email: NEWBIE })]);
  check((await credit((await staged(2)).id, NEWBIE)) === "credited", "is still credited");
  const newbie = await one(`select id from employees where email = $1`, [NEWBIE]);
  check(Boolean(newbie), "their employee row is created, ready for their first sign-in");
  check((await referralsFor(cand(2)))[0]?.referrer_id === newbie?.id, "and the referral is theirs");

  console.log("\nA name only — waits for an admin");
  const nameOnly = await upsert([row(3, { sourced_by: "ZZ Referrer Person", suggested_employee_id: emp[REFERRER] })]);
  const r3 = await staged(3);
  check(!nameOnly.some((x) => x.out_row_id === r3.id), "is NOT ready to credit");
  check(r3.status === "needs_review", "sits in the review queue");
  check(r3.suggested_employee_id === emp[REFERRER], "with the suggested employee kept for the admin");
  check((await referralsFor(cand(3))).length === 0, "and no referral exists yet");

  console.log("\nAlready a Hub referral — recognised, not duplicated");
  const hub4 = await hubReferral(emp[OTHER], 4);
  await upsert([row(4), row(5, { email: `zz-keka-${RUN}-5-other@example.invalid`, phone: phone(4) })]);
  const r4 = await staged(4);
  const r5 = await staged(5);
  const hubId = (await one(`select id from referrals where ref_code = $1`, [hub4.ref_code])).id;
  check(r4.status === "in_hub" && r4.referral_id === hubId, "matched on email");
  check(r5.status === "in_hub" && r5.referral_id === hubId, "matched on phone alone");
  check((await referralsFor(cand(4))).length === 1, "no second referral created");

  console.log("\nA race with a Hub referral loses cleanly");
  await upsert([row(6, { sourced_by: "ZZ Referrer Person" })]);
  await hubReferral(emp[OTHER], 6); // arrives between the sync and the admin's click
  check((await credit((await staged(6)).id, REFERRER, emp[ADMIN])) === "duplicate", "reported as a duplicate");
  check((await referralsFor(cand(6))).length === 1, "the first referral holds; nothing added");
  check((await staged(6)).status === "duplicate", "and the queue says so");

  console.log("\nA non-work address is refused");
  await upsert([row(7, { sourced_by: "someone" })]);
  const r7 = await staged(7);
  check((await credit(r7.id, "someone@gmail.com", emp[ADMIN])) === "refused", "refused");
  check(/limited to/i.test((await staged(7)).reason ?? ""), "with the domain rule as the reason");
  check(!(await one(`select 1 from employees where email = 'someone@gmail.com'`)), "no employee row was created");
  check((await referralsFor(cand(7))).length === 0, "and no referral");

  console.log("\nIncomplete in Keka, then fixed there");
  await upsert([row(8, { phone: "" })]);
  const r8 = await staged(8);
  check(r8.status === "incomplete" && /mobile/i.test(r8.reason ?? ""), "no phone: incomplete, and says why");
  await upsert([row(8)]);
  check((await staged(8)).status === "needs_review", "phone added in Keka: back in the queue");

  console.log("\nThe stage sync then tracks an imported referral");
  const out = await one(`select * from apply_keka_candidate_stages($1::jsonb)`, [
    JSON.stringify([{ keka_job_id: job.keka_job_id, email: cand(1), keka_candidate_id: `e2e-${RUN}-1`, stage: "Shortlisted", occurred_at: "2026-09-26T06:00:00Z" }]),
  ]);
  check(Number(out?.matched) >= 1, "the stage sync matches it");
  // current_stage holds the employee's wording from keka_stage_map, never
  // Keka's own stage name — so compare against the mapping, not a literal.
  const wording = (await one(`select employee_wording from keka_stage_map where keka_stage_id = 'Shortlisted'`))?.employee_wording;
  const now1 = await one(`select current_stage from referrals where id = $1`, [ref1.id]);
  check(Boolean(wording) && now1.current_stage === wording, `and moves it on, in the employee's words ("${now1.current_stage}")`);
  check(
    Boolean(await one(`select 1 from referral_stages where referral_id = $1 and stage = 'Shortlisted'`, [ref1.id])),
    "the Keka stage is recorded in the journey",
  );

  console.log("\nThe admin screen");
  const adminPage = await (await contextFor(ADMIN)).newPage();
  const pageErrors = [];
  adminPage.on("pageerror", (e) => pageErrors.push(e.message));
  await adminPage.goto(`${BASE}/admin/keka-referrals`, { waitUntil: "networkidle" });
  await adminPage.evaluate(() => document.querySelector("dialog[open]")?.close());
  const body = await adminPage.locator("body").innerText();
  check(/Automatic crediting\s*Off — no referrer field set/.test(body), "says automatic crediting is off while no field is set");
  check(body.includes("Referrer work email"), "lists the field names Keka sent");
  const card3 = adminPage.locator("li", { hasText: `ZZ Keka 3 ${RUN}` });
  check((await card3.locator('input[name="referrerEmail"]').inputValue()) === REFERRER, "pre-fills the suggested referrer");
  await card3.locator('button:has-text("Credit referral")').click();
  await adminPage.waitForTimeout(2500);
  const credited3 = await staged(3);
  check(credited3.status === "credited" && credited3.resolved_by === emp[ADMIN], "crediting from the queue works, and records who did it");
  check((await referralsFor(cand(3)))[0]?.referrer_id === emp[REFERRER], "to the right person");

  await adminPage.goto(`${BASE}/admin/keka-referrals`, { waitUntil: "networkidle" });
  await adminPage.locator("li", { hasText: `ZZ Keka 7 ${RUN}` }).locator('button:has-text("Not a referral")').click();
  await adminPage.waitForTimeout(2000);
  check((await staged(7)).status === "dismissed", "dismissing works");
  check(pageErrors.length === 0, `no browser errors${pageErrors.length ? `: ${pageErrors.join("; ")}` : ""}`);

  const plain = await (await contextFor(REFERRER)).newPage();
  const denied = await plain.goto(`${BASE}/admin/keka-referrals`);
  check(denied?.status() === 404, `a non-admin gets 404 (got ${denied?.status()})`);

  console.log("\nThe referrer's view");
  await plain.goto(`${BASE}/referrals`, { waitUntil: "networkidle" });
  await plain.evaluate(() => document.querySelector("dialog[open]")?.close());
  const mine = await plain.locator("body").innerText();
  check(mine.includes(`ZZ Keka 1 renamed ${RUN}`) || mine.includes(`ZZ Keka 1 ${RUN}`), "sees the referral they made in Keka");
  check(mine.includes(`ZZ Keka 3 ${RUN}`), "and the one an admin credited to them");
  check(/Made in Keka/.test(mine), "marked as made in Keka");
  check(!mine.includes(`ZZ Hub 4 ${RUN}`), "but not someone else's");
} catch (e) {
  failures++;
  console.log(`  FAIL  unexpected: ${e.message}`);
} finally {
  await browser.close();
  await db.query(`delete from keka_referral_candidates where keka_candidate_id like $1`, [`e2e-${RUN}-%`]);
  await db.query(
    `delete from referrals where candidate_id in (select id from candidates where email_normalised like $1)`,
    [`zz-keka-${RUN}-%`],
  );
  await db.query(`delete from candidates where email_normalised like $1`, [`zz-keka-${RUN}-%`]);
  await db.query(`delete from employees where email = any($1)`, [[REFERRER, ADMIN, OTHER, NEWBIE]]);
  const left = await one(
    `select (select count(*) from keka_referral_candidates where keka_candidate_id like $1)::int staged,
            (select count(*) from candidates where email_normalised like $2)::int candidates`,
    [`e2e-${RUN}-%`, `zz-keka-${RUN}-%`],
  );
  console.log(`\ncleanup: ${left.staged} staging rows and ${left.candidates} candidates left`);
  await db.end();
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nPASS — Keka referrals come into the Hub, credited only when certain");
process.exit(failures ? 1 : 0);
