/**
 * The leaderboard with HR's pre-Hub history — import, ranking, page.
 *
 *   node --env-file=.env.local scripts/e2e-leaderboard.mjs      (dev server running)
 *
 * Proves, on synthetic data:
 *   · the import stores no candidate name, re-runs without duplicating, and
 *     refuses a whole file for one unknown status or unreadable date
 *   · forfeited bonuses count as a join but not as earned; owed ones count
 *   · a sheet name joins a Hub account only when exactly one employee has it
 *   · a hire in both the sheet and the Hub is counted once
 *   · periods filter on the joining date
 *   · the page marks the leader gold and you mint, with labels, and a table
 *   · a tie races as a pack under one label; the engine sound is served
 *
 * Synthetic joins are dated today, so they land in "This month", which the
 * real history leaves empty. Every row, referral and employee is deleted after.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { encode } from "next-auth/jwt";
import pg from "pg";

const BASE = process.env.SHOOT_BASE ?? "http://localhost:3000";
const RUN = Date.now();
// Letters only: name_key() drops digits, so a numeric run id would make every
// test name the same person.
const TAG = RUN.toString(36).replace(/\d/g, (d) => "abcdefghij"[d]);
const N = (s) => `ZZ ${s} ${TAG}`;

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0] ?? null;
const all = async (sql, p = []) => (await db.query(sql, p)).rows;

const today = (await one(`select to_char(current_date, 'YYYY-MM-DD') d`)).d;
const twoYearsAgo = (await one(`select to_char(current_date - interval '2 years', 'YYYY-MM-DD') d`)).d;

// The real SQL the page runs, taken from the source rather than copied.
const src = readFileSync("src/lib/rewards.ts", "utf8");
const JOINS = src.slice(src.indexOf("const JOINS_SQL = `") + 19, src.indexOf("`;", src.indexOf("const JOINS_SQL = `")));
const board = (since) =>
  all(
    `${JOINS}
     select person_key, (array_agg(name order by src, joined_on desc))[1] as name,
            count(*)::int joined, sum(amount)::int earned
       from joins where joined_on >= (${since})::date and name ilike $1
      group by person_key order by joined desc, earned desc, name`,
    [`%${TAG}%`],
  );

const dir = mkdtempSync(join(tmpdir(), "e2e-lb-"));
const csv = (name, rows) => {
  const file = join(dir, `e2e-${TAG}-${name}.csv`);
  const head = "Candidate Name,Candidate Status,DoJ,Referred date,Job Title,Recruiter,Recruiter Designation,Amount INR,Status";
  writeFileSync(file, [head, ...rows.map((r) => r.join(","))].join("\n"));
  return file;
};
const importer = (file) =>
  spawnSync(process.execPath, ["--env-file=.env.local", "scripts/import-history.mjs", file], { encoding: "utf8" });
const rowsFrom = async (file) =>
  (await one(`select count(*)::int n from historical_referrals where source = $1`, [`hr-sheet:${file.split("/").pop()}`])).n;

const d = (x) => `${x} 00:00:00`;
const good = csv("good", [
  [N("Cand Aa"), "Working", d(today), d(today), "Fellow", N("Racer Alpha"), "Fellows", "5000.0", "Paid"],
  [N("Cand Bb"), "Working", d(today), d(today), "Fellow", N("Racer Alpha"), "Fellows", "5000.0", "Paid"],
  [N("Cand Cc"), "Relieved", d(today), d(today), "Fellow", N("Racer Alpha"), "Fellows", "N/A", "Employee Exited"],
  [N("Cand Dd"), "Working", d(today), d(today), "Analyst", N("Solo Name"), "Data Analyst", "6000.0", "Not yet paid"],
  [N("Cand Ee"), "Working", d(today), d(today), "Analyst", N("Solo Name"), "Data Analyst", "6000.0", "paid"],
  [N("Cand Ff"), "Working", d(today), d(today), "Analyst", N("Twin Name"), "Associate", "1000.0", "Paid"],
  [N("Dup"), "Working", d(today), d(today), "Engineer", N("Racer Beta"), "SDE", "20000.0", "Paid"],
  [N("Cand Hh"), "Working", d(twoYearsAgo), d(twoYearsAgo), "Engineer", N("Racer Beta"), "SDE", "1000.0", "Paid"],
]);

const created = { employees: [], referral: null };
const browser = await chromium.launch();

try {
  console.log("\nThe import");
  const first = importer(good);
  check(first.status === 0 && /8 new/.test(first.stdout), `imports a clean sheet (${first.stdout.trim().split("\n").pop()})`);
  const again = importer(good);
  check(again.status === 0 && /0 new, 8 updated/.test(again.stdout), "re-running updates, never duplicates");
  const stored = JSON.stringify(await all(`select * from historical_referrals where source = $1`, [`hr-sheet:${good.split("/").pop()}`]));
  check(!/Cand (Aa|Bb|Cc|Dd|Ee|Ff|Hh)/.test(stored) && !stored.includes(N("Dup")), "no candidate name is stored");
  check(stored.includes(N("Racer Alpha")), "the referrer is");

  const badStatus = csv("status", [[N("Cand Xx"), "Working", d(today), "", "", N("Racer Gamma"), "", "5000", "Pending approval"]]);
  const s = importer(badStatus);
  check(s.status !== 0 && /Unrecognised Status/.test(s.stderr), "an unknown status stops the import");
  check((await rowsFrom(badStatus)) === 0, "and writes nothing");
  const badDate = csv("date", [
    [N("Cand Yy"), "Working", d(today), "", "", N("Racer Gamma"), "", "5000", "Paid"],
    [N("Cand Zz"), "Working", "sometime", "", "", N("Racer Gamma"), "", "5000", "Paid"],
  ]);
  const t = importer(badDate);
  check(t.status !== 0 && /unreadable joining date/.test(t.stderr), "one unreadable date stops the whole file");
  check((await rowsFrom(badDate)) === 0, "not even the good row is written");

  console.log("\nWho is who");
  const emp = async (name, email) => {
    const r = await one(
      `insert into employees (email, full_name, welcome_ack_at) values ($1, $2, now()) returning id`,
      [email, name],
    );
    created.employees.push(r.id);
    return r.id;
  };
  const solo = await emp(N("Solo Name"), `e2e_lb_solo_${RUN}@convegenius.ai`);
  await emp(N("Twin Name"), `e2e_lb_twin_a_${RUN}@convegenius.ai`);
  await emp(N("Twin Name"), `e2e_lb_twin_b_${RUN}@convegenius.ai`);
  const hubRef = await emp(N("Hub Referrer"), `e2e_lb_hub_${RUN}@convegenius.ai`);

  // A Hub referral of the same person the sheet credits to Beta.
  const job = await one(`select id from jobs where is_open order by id limit 1`);
  const ref = await one(
    `select * from submit_referral($1,$2,$3,$4,$5,null,null,null,'Friend','e2e consent')`,
    [hubRef, job.id, N("Dup"), `zz-lb-dup-${RUN}@example.invalid`, `7${String(RUN).slice(-9)}`],
  );
  created.referral = ref.ref_code;
  await db.query(`update referrals set joined_at = now() where ref_code = $1`, [ref.ref_code]);

  const month = await board("date_trunc('month', now())");
  const by = Object.fromEntries(month.map((r) => [r.name, r]));
  const alpha = by[N("Racer Alpha")], soloRow = by[N("Solo Name")], twin = by[N("Twin Name")], hub = by[N("Hub Referrer")];

  check(alpha?.joined === 3, `a forfeited bonus still counts as a join (${alpha?.joined})`);
  check(alpha?.earned === 10000, `…but not as earned (₹${alpha?.earned})`);
  check(soloRow?.earned === 12000, "an owed bonus counts as earned");
  check(soloRow?.person_key === solo, "a unique name joins that employee's account");
  check(twin?.person_key?.startsWith("name:"), "two employees with one name: joined to neither");
  check(hub?.joined === 1, "the Hub referral counts");
  check(!by[N("Racer Beta")], "the same hire in the sheet does not count again");
  check(
    JSON.stringify(month.map((r) => r.name)) === JSON.stringify([N("Racer Alpha"), N("Solo Name"), N("Twin Name"), N("Hub Referrer")]),
    "ranked by joins, then earned",
  );

  const ever = Object.fromEntries((await board("'-infinity'::timestamptz")).map((r) => [r.name, r]));
  check(ever[N("Racer Beta")]?.joined === 1, "all time: Beta keeps the join from two years ago");
  check(!Object.keys(Object.fromEntries(month.map((r) => [r.name, r]))).includes(N("Racer Beta")), "…which this month leaves out");

  console.log("\nThe page");
  const token = await encode({
    token: { name: N("Solo Name"), email: `e2e_lb_solo_${RUN}@convegenius.ai`, sub: solo, exp: Math.floor(Date.now() / 1000) + 600 },
    secret: process.env.AUTH_SECRET,
    salt: "authjs.session-token",
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, reducedMotion: "reduce" });
  await ctx.addCookies([{ name: "authjs.session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 140)));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/leaderboard?period=monthly`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.querySelector("dialog[open]")?.close());

  const rowText = await page.locator("tbody tr").allInnerTexts();
  check(rowText[0]?.includes(N("Racer Alpha")), "the leader tops the standings");
  check(rowText.some((r) => r.includes(N("Solo Name")) && /You/.test(r)), "your own row is marked You");
  check((await page.locator('svg.race path[fill="#c98500"]').count()) === 1, "one gold car: the leader");
  check((await page.locator('svg.race path[fill="#199e70"]').count()) === 1, "one mint car: you");
  check((await page.locator("svg.race desc").textContent())?.includes(N("Racer Alpha")), "the race has a text description");
  check(/Leader/.test(await page.locator('[aria-label="Legend"]').innerText()), "and a legend, so colour is never alone");
  // Twin and Hub tie on 1: one label for the pair, no badge per car.
  const packs = await page.locator("svg.race .race-tag", { hasText: "tied on" }).allTextContents();
  check(packs.some((t) => /3–4\s*2 tied on 1/.test(t)), `a tie is one pack label (${packs.join(" / ") || "none"})`);
  const badges = await page.locator("svg.race .race-badge-text").allTextContents();
  check(!badges.includes("4"), "and the cars in it carry no badge of their own");
  const sfx = await page.request.get(`${BASE}/sfx/engine-loop.wav`);
  check(sfx.ok() && /audio/.test(sfx.headers()["content-type"] ?? ""), "the engine sound is served to a signed-in user");
  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} catch (e) {
  failures++;
  console.log(`  FAIL  unexpected: ${e.message}`);
} finally {
  await browser.close();
  await db.query(`delete from historical_referrals where source like $1`, [`hr-sheet:e2e-${TAG}-%`]);
  if (created.referral) {
    await db.query(
      `delete from referrals where candidate_id in (select id from candidates where email_normalised = $1)`,
      [`zz-lb-dup-${RUN}@example.invalid`],
    );
    await db.query(`delete from candidates where email_normalised = $1`, [`zz-lb-dup-${RUN}@example.invalid`]);
  }
  if (created.employees.length) await db.query(`delete from employees where id = any($1)`, [created.employees]);
  const left = await one(`select count(*)::int n from historical_referrals where source like $1`, [`hr-sheet:e2e-${TAG}-%`]);
  console.log(`\ncleanup: ${left.n} test history rows left`);
  await db.end();
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nPASS — the leaderboard and its history");
process.exit(failures ? 1 : 0);
