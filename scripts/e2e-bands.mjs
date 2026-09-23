/**
 * Proves the reward band rules and the point-based gift tiers.
 *
 *   npm run e2e:bands
 *
 * The band table decides the rupee figure every employee is promised, so the
 * rules around it are worth pinning down:
 *
 *   · a title that names a designation takes its band's reward
 *   · a band inferred from experience is applied too (HR's instruction),
 *     and held back only when the auto-apply setting is off
 *   · a band whose amount HR wrote ambiguously is held
 *   · a role HR priced by hand, or banded by hand, is never touched again
 *   · editing the table re-prices roles but never an existing promise
 *   · gifts unlock on reward points earned from people who joined
 *
 * Works on temporary jobs, employees and referrals, and on the
 * Engineering B8+ row, which no real role uses. Restores everything.
 */

import pg from "pg";

const TAG = Date.now();
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL.replace(
    /([?&])sslmode=(require|prefer|verify-ca)\b/gi,
    "$1sslmode=verify-full",
  ),
});
await db.connect();

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) failures++;
};
const one = async (s, p) => (await db.query(s, p)).rows[0];

const made = { jobs: [], refs: [], emp: null };
const band = await one(`select amount, amount_label from reward_bands where track='engineering' and band='B8+'`);

async function job(title, extra = {}) {
  const r = await one(
    `insert into jobs (keka_job_id, source, req_id, title, department, location, experience_band,
                       is_open, reward_amount, eligibility_days, reward_origin)
     values ($1,'keka',$2,$3,'Testing','Noida','5 yrs',true,10000,30,$4) returning id`,
    [`e2e-band-${TAG}-${made.jobs.length}`, `E2EBAND${TAG}${made.jobs.length}`, title, extra.origin ?? "band"],
  );
  made.jobs.push(r.id);
  return r.id;
}
const state = (id) =>
  one(`select band, track, band_source, reward_amount, reward_confirmed, reward_origin from jobs where id=$1`, [id]);

try {
  console.log("\napplying bands");
  const title = await job("E2E Senior Manager");
  const exper = await job("E2E Widget Lead");
  const held = await job("E2E Fellows");
  const custom = await job("E2E Custom Priced", { origin: "custom" });

  const res = await one(`select * from apply_job_bands($1::jsonb)`, [
    JSON.stringify([
      { job_id: title, track: "non_engineering", band: "B6", source: "title" },
      { job_id: exper, track: "engineering", band: "B4", source: "experience" },
      { job_id: held, track: "non_engineering", band: "B1", source: "title" },
      { job_id: custom, track: "engineering", band: "B8+", source: "title" },
    ]),
  ]);
  check(Number(res.applied) === 2 && Number(res.suggested) === 0 && Number(res.held) === 1,
    `counts: applied ${res.applied}, suggested ${res.suggested}, held ${res.held}`);

  let s = await state(title);
  check(s.reward_confirmed && s.reward_amount === 80000, "a title match takes its band's reward, confirmed");

  s = await state(exper);
  check(s.reward_confirmed && s.reward_amount === 80000 && s.band === "B4",
    "a role with no designation takes the band inferred from experience");
  check(s.band_source === "experience", "…and is marked as inferred, so HR can see it");

  s = await state(held);
  check(!s.reward_confirmed, "an ambiguous band (\"2000 + 5000\") is held back");

  s = await state(custom);
  check(s.reward_amount === 10000 && s.band === null, "a role HR priced by hand is left alone");

  console.log("\nwith auto-apply switched off");
  const prev = (await one(`select value from app_settings where key='auto_apply_experience_bands'`)).value;
  await db.query(`update app_settings set value='false' where key='auto_apply_experience_bands'`);
  const cautious = await job("E2E Gadget Lead");
  await one(`select * from apply_job_bands($1::jsonb)`, [
    JSON.stringify([{ job_id: cautious, track: "engineering", band: "B4", source: "experience" }]),
  ]);
  await db.query(`update app_settings set value=$1 where key='auto_apply_experience_bands'`, [prev]);
  s = await state(cautious);
  check(!s.reward_confirmed && s.reward_amount === 80000, "it is only a suggestion, kept off employees' screens");

  console.log("\nHR moves a role");
  await db.query(`select set_job_band($1,'engineering','B4')`, [exper]);
  s = await state(exper);
  check(s.reward_confirmed && s.band_source === "hr", "HR's choice is live, and marked as HR's");

  await one(`select * from apply_job_bands($1::jsonb)`, [
    JSON.stringify([{ job_id: exper, track: "engineering", band: "B2", source: "experience" }]),
  ]);
  s = await state(exper);
  check(s.band === "B4", "the next sync does not overrule HR's choice");

  let refused = null;
  try { await db.query(`select set_job_band($1,'non_engineering','B1')`, [exper]); }
  catch (e) { refused = e.message; }
  check(refused !== null, "a band awaiting clarification cannot be chosen");

  console.log("\nediting the band table (Engineering B8+, no real roles)");
  const top = await job("E2E VP Engineering");
  await one(`select * from apply_job_bands($1::jsonb)`, [
    JSON.stringify([{ job_id: top, track: "engineering", band: "B8+", source: "title" }]),
  ]);
  made.emp = (await one(`insert into employees (email, full_name) values ($1,'E2E Bands') returning id`,
    [`e2e_bands_${TAG}@convegenius.ai`])).id;
  const sub = await one(`select * from submit_referral($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [made.emp, top, "Band Cand", `e2e.band.${TAG}@example.com`, "9100000077", null, null, null, "Friend", "consent"]);
  const ref = (await one(`select id from referrals where ref_code=$1`, [sub.ref_code])).id;
  made.refs.push(ref);

  const n = await one(`select set_band_amount('engineering','B8+',200000,'') as n`);
  check(Number(n.n) >= 1, `re-prices roles following the band (${n.n})`);
  s = await state(top);
  check(s.reward_amount === 200000, "the role now pays the new figure");
  const snap = await one(`select reward_amount_snapshot a from referrals where id=$1`, [ref]);
  check(snap.a === band.amount, `a referral already made keeps its promise (₹${snap.a})`);

  console.log("\ngifts on reward points");
  // Two people who joined, on confirmed rewards of 80,000 and 40,000.
  const j2 = await job("E2E Points Role");
  await db.query(`update jobs set reward_amount=40000, reward_confirmed=true where id=$1`, [j2]);
  await db.query(`update jobs set reward_amount=80000, reward_confirmed=true where id=$1`, [top]);
  for (const [jid, n2] of [[top, 2], [j2, 3]]) {
    const r = await one(`select * from submit_referral($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [made.emp, jid, `Pts ${n2}`, `e2e.pts.${n2}.${TAG}@example.com`, `91000000${70 + n2}`, null, null, null, "Friend", "consent"]);
    const rid = (await one(`select id from referrals where ref_code=$1`, [r.ref_code])).id;
    made.refs.push(rid);
    await db.query(`select record_referral_stage($1,'Hired',now(),'keka')`, [rid]);
  }
  // The same query src/lib/rewards.ts runs.
  const tiers = (await db.query(
    `with mine as (
       select coalesce(sum(reward_amount_snapshot) filter (where reward_confirmed_snapshot), 0)::int as points
         from referrals where referrer_id = $1 and joined_at is not null)
     select t.name, t.threshold, (select points from mine) >= t.threshold as unlocked, (select points from mine) as points
       from milestone_tiers t where t.is_active order by t.threshold`, [made.emp])).rows;
  const pts = tiers[0].points;
  // The first referral was made at the old B8+ snapshot and has not joined;
  // the two that joined are 80,000 + 40,000.
  check(pts === 120000, `points = rupees earned on people who joined (${pts.toLocaleString("en-IN")})`);
  const unlocked = tiers.filter((t) => t.unlocked).map((t) => t.name);
  check(unlocked.length === 1 && unlocked[0] === "Smartwatch",
    `1,20,000 points unlocks the smartwatch only (${unlocked.join(", ") || "none"})`);
  check(tiers.map((t) => t.threshold).join(",") === "100000,200000,350000,400000",
    "tiers are 1,00,000 / 2,00,000 / 3,50,000 / 4,00,000");
} finally {
  await db.query(`update reward_bands set amount=$1, amount_label=$2 where track='engineering' and band='B8+'`,
    [band.amount, band.amount_label]);
  for (const id of made.refs) {
    await db.query(`delete from reward_events where reward_id in (select id from referral_rewards where referral_id=$1)`, [id]);
    await db.query(`delete from referral_rewards where referral_id=$1`, [id]);
    await db.query(`delete from referral_stages where referral_id=$1`, [id]);
    const c = await one(`select candidate_id from referrals where id=$1`, [id]);
    await db.query(`delete from referrals where id=$1`, [id]);
    if (c) await db.query(`delete from candidates where id=$1`, [c.candidate_id]);
  }
  for (const id of made.jobs) await db.query(`delete from jobs where id=$1`, [id]);
  if (made.emp) await db.query(`delete from employees where id=$1`, [made.emp]);
  const b = await one(`select amount from reward_bands where track='engineering' and band='B8+'`);
  console.log(`\ncleanup done — band restored to ₹${b.amount.toLocaleString("en-IN")}, referrals left: ${(await one(`select count(*)::int n from referrals`)).n}`);
  await db.end();
}

console.log(failures ? `\nFAIL — ${failures} check(s) failed\n` : "\nPASS — bands and points behave\n");
process.exit(failures ? 1 : 0);
