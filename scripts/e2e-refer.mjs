// End-to-end check of the referral flow against a running dev server.
//
//   node --env-file=.env.local scripts/e2e-refer.mjs
//
// Submits a referral through the real form, verifies what landed in the
// database, submits the same candidate again to confirm the duplicate is
// refused, then DELETES both rows it created. It writes to whatever
// DATABASE_URL points at, so do not run it against production once there is
// real data in there.
import { chromium } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { Client } from "pg";

const BASE = "http://localhost:3000";
const STAMP = Date.now().toString(36);
const CAND = {
  name: `ZZ Test Candidate ${STAMP}`,
  email: `zz-test-${STAMP}@example.invalid`,
  phone: "9000000001",
};

const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const token = await encode({
  token: { name: "Pradyumn Awasthi", email: "pradyumn@convegenius.ai", sub: "p", exp: Math.floor(Date.now()/1000)+3600 },
  secret: process.env.AUTH_SECRET, salt: "authjs.session-token",
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addCookies([{ name: "authjs.session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(e.message));

async function submit(label) {
  await page.goto(`${BASE}/refer`, { waitUntil: "networkidle" });
  await page.evaluate(() => { try { localStorage.setItem("referral-hub:welcome-seen","1"); } catch {} ; document.querySelector("dialog[open]")?.close(); });

  // The role picker is a searchable combobox: type, then Enter picks the
  // highlighted match — the keyboard path a person would use.
  await page.click("#jobId");
  await page.keyboard.type("a");
  await page.keyboard.press("Enter");
  await page.waitForSelector('button:has-text("Change role")', { timeout: 5000 });
  await page.fill("#fullName", CAND.name);
  await page.fill("#email", CAND.email);
  await page.fill("#phone", CAND.phone);
  await page.fill("#currentOrg", "Example Corp");
  await page.selectOption("#relationship", { index: 1 });
  await page.check("#consent");

  await page.click('button:has-text("Review referral")');
  await page.waitForTimeout(400);
  const onReview = await page.locator('button:has-text("Submit referral")').count();
  console.log(`  [${label}] reached review step: ${onReview ? "yes" : "NO"}`);

  await page.click('button:has-text("Submit referral")');
  await page.waitForTimeout(2500);

  const done = await page.locator('h1:has-text("Referral submitted")').count();
  const alert = await page.locator('[role="alert"]').first().textContent().catch(() => null);
  await page.screenshot({ path: `.screenshots/e2e-${label}.png`, fullPage: true });
  return { done: done > 0, alert: alert?.trim() ?? null };
}

console.log("=== 1st submission (expect success) ===");
const first = await submit("first");
console.log("  success screen:", first.done ? "YES ✓" : "no");
if (first.alert) console.log("  message:", first.alert);

const rows = await db.query(
  `select r.ref_code, r.status, r.reward_amount_snapshot, r.eligibility_days_snapshot,
          r.valid_until, r.consent_text is not null as has_consent,
          c.email_normalised, c.phone_e164,
          (select count(*) from referral_stages s where s.referral_id = r.id) stages
     from referrals r join candidates c on c.id = r.candidate_id
    where c.email_normalised = $1`, [CAND.email.toLowerCase()]);
console.log("\n=== database check ===");
if (!rows.rows.length) console.log("  NO ROW WRITTEN ✗");
else {
  const r = rows.rows[0];
  console.log("  ref_code:      ", r.ref_code, /^REF-[0-9A-F]{8}$/.test(r.ref_code) ? "✓ new 8-hex format" : "✗ unexpected format");
  console.log("  status:        ", r.status);
  console.log("  reward snapshot:", r.reward_amount_snapshot, "| eligibility:", r.eligibility_days_snapshot);
  console.log("  phone stored:  ", r.phone_e164, r.phone_e164 === "+919000000001" ? "✓ E.164" : "✗");
  console.log("  consent stored:", r.has_consent ? "✓" : "✗");
  console.log("  stage rows:    ", r.stages, Number(r.stages) === 1 ? "✓" : "✗");
  const months = (new Date(r.valid_until) - Date.now()) / (1000*60*60*24*30.4);
  console.log("  valid_until:   ", new Date(r.valid_until).toISOString().slice(0,10), `(~${months.toFixed(1)} months) `, months > 5.5 && months < 6.5 ? "✓" : "✗");
}

console.log("\n=== 2nd submission, same candidate (expect duplicate refusal) ===");
const second = await submit("duplicate");
console.log("  success screen:", second.done ? "✗ DUPLICATE ALLOWED" : "no ✓");
console.log("  message:", second.alert);
console.log("  names the earlier referrer:", /pradyumn|awasthi|referred by/i.test(second.alert ?? "") ? "✗ LEAK" : "no ✓");

await browser.close();

console.log("\n=== cleanup ===");
const del = await db.query(
  `with r as (delete from referrals where candidate_id in
                (select id from candidates where email_normalised = $1) returning id)
   select count(*) n from r`, [CAND.email.toLowerCase()]);
const dc = await db.query(`delete from candidates where email_normalised = $1`, [CAND.email.toLowerCase()]);
console.log(`  deleted ${del.rows[0].n} referral(s), ${dc.rowCount} candidate(s)`);
const left = await db.query("select count(*) n from referrals");
console.log("  referrals remaining in database:", left.rows[0].n);
await db.end();
console.log(errs.length ? "\nPAGE ERRORS: " + errs.join("; ") : "\nno page errors");
