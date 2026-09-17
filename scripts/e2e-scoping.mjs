// Proves My referrals shows only your own referrals.
//
//   node --env-file=.env.local scripts/e2e-scoping.mjs
//
// This is the most important test in the repo. Row-level security used to
// guarantee this; since 0002 removed it, the sole protection is
// `where r.referrer_id = $1` in src/app/(app)/referrals/page.tsx. Nothing else
// will catch that clause being dropped or made conditional.
//
// Creates one referral for each of two employees, checks each sees only theirs,
// then deletes both.
import { chromium } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { Client } from "pg";

const BASE = "http://localhost:3000";
const S = Date.now().toString(36);

const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const emps = (await db.query("select id, email from employees order by created_at limit 2")).rows;
if (emps.length < 2) { console.log("need two employee rows; found", emps.length); process.exit(1); }

const job = (await db.query("select id from jobs where is_open limit 1")).rows[0];

const people = [
  { emp: emps[0], cand: `AA Scope ${S}`, email: `aa-scope-${S}@example.invalid`, phone: "9000000011" },
  { emp: emps[1], cand: `BB Scope ${S}`, email: `bb-scope-${S}@example.invalid`, phone: "9000000012" },
];

for (const p of people) {
  const r = await db.query(
    `select * from submit_referral($1,$2,$3,$4,$5,null,null,null,'Friend','test consent')`,
    [p.emp.id, job.id, p.cand, p.email, p.phone]);
  p.ref = r.rows[0].ref_code;
  console.log(`seeded ${p.ref} for ${p.emp.email.split("@")[0].slice(0,3)}*** → ${p.cand}`);
}

const browser = await chromium.launch();
let pass = true;

for (const me of people) {
  const other = people.find(p => p !== me);
  const token = await encode({
    token: { name: "T", email: me.emp.email, sub: "x", exp: Math.floor(Date.now()/1000)+3600 },
    secret: process.env.AUTH_SECRET, salt: "authjs.session-token",
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "authjs.session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/referrals`, { waitUntil: "networkidle" });
  const body = await page.locator("body").innerText();

  const seesOwn = body.includes(me.cand);
  const seesOther = body.includes(other.cand);
  const seesOtherCode = body.includes(other.ref);

  console.log(`\nas ${me.emp.email.split("@")[0].slice(0,3)}***`);
  console.log(`  sees own referral (${me.cand}):    ${seesOwn ? "yes ✓" : "NO ✗"}`);
  console.log(`  sees other's candidate name:        ${seesOther ? "YES ✗ LEAK" : "no ✓"}`);
  console.log(`  sees other's ref code:              ${seesOtherCode ? "YES ✗ LEAK" : "no ✓"}`);
  if (!seesOwn || seesOther || seesOtherCode) pass = false;
  await ctx.close();
}

await browser.close();

for (const p of people) {
  await db.query(`delete from referrals where candidate_id in (select id from candidates where email_normalised = $1)`, [p.email]);
  await db.query(`delete from candidates where email_normalised = $1`, [p.email]);
}
const left = await db.query("select count(*) n from referrals");
console.log("\ncleanup done, referrals remaining:", left.rows[0].n);
await db.end();

console.log(pass ? "\nPASS — referrals are scoped to the signed-in employee" : "\nFAIL — scoping is broken");
process.exit(pass ? 0 : 1);
