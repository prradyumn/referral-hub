/**
 * Proves the reward ledger — the part of this product Keka does not do.
 *
 *   npm run e2e:engine
 *
 * Covers the full life of a reward: a candidate reaching Hired in Keka
 * creates one, the qualifying period gates it, approval is refused on an
 * amount nobody agreed to, and money is never counted twice.
 *
 * CONTEXT.md commitment 3 — "a promise made is a promise kept" — is what all
 * of this is defending, so it is worth testing properly.
 *
 * Creates and deletes everything it touches.
 */

import pg from "pg";

const TAG = Date.now();
const REFERRER = `e2e_eng_ref_${TAG}@convegenius.ai`;
const ADMIN = `e2e_eng_adm_${TAG}@convegenius.ai`;

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) failures++;
};
const one = async (s, p) => (await db.query(s, p)).rows[0];

const created = { employees: [], jobs: [], referrals: [] };

try {
  const refId = (
    await one(`insert into employees (email, full_name) values ($1,$2) returning id`, [
      REFERRER,
      "E2E Referrer",
    ])
  ).id;
  const admId = (
    await one(
      `insert into employees (email, full_name, is_admin) values ($1,$2,true) returning id`,
      [ADMIN, "E2E Admin"],
    )
  ).id;
  created.employees.push(refId, admId);

  const mkJob = async (confirmed, days) =>
    (
      await one(
        `insert into jobs (keka_job_id, source, req_id, title, department, location,
                           experience_band, is_open, reward_amount, eligibility_days,
                           reward_confirmed)
         values ($1,'keka',$2,'E2E Engine Role','Testing','Noida','1-2 yrs',true,
                 12000,$3,$4)
         returning id`,
        [`e2e-eng-${TAG}-${confirmed}-${days}`, `E2EENG${TAG}${confirmed}${days}`, days, confirmed],
      )
    ).id;

  const refer = async (jobId, n) => {
    const r = await one(`select * from submit_referral($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
      refId, jobId, `Eng Cand ${n}`, `e2e.eng.${n}.${TAG}@example.com`,
      `91000${String(n).padStart(5, "0")}`, null, null, null, "Friend", "consent",
    ]);
    const row = await one(`select id from referrals where ref_code=$1`, [r.ref_code]);
    created.referrals.push(row.id);
    return row.id;
  };

  // ---------------------------------------------------------------------
  console.log("\nnothing is owed before anyone joins");
  const jobA = await mkJob(true, 30);
  created.jobs.push(jobA);
  const a = await refer(jobA, 1);

  await one(`select * from refresh_reward_states()`);
  const noReward = await one(`select count(*)::int n from referral_rewards where referral_id=$1`, [a]);
  check(noReward.n === 0, "a referral that has not joined has no reward row");

  // ---------------------------------------------------------------------
  console.log("\nthe candidate reaches Hired in Keka");
  // Backdated so the qualifying period is already complete.
  await db.query(`select record_referral_stage($1,'Hired',$2,'keka')`, [
    a, new Date(Date.now() - 40 * 864e5).toISOString(),
  ]);
  const joined = await one(`select joined_at from referrals where id=$1`, [a]);
  check(joined.joined_at !== null, "the Hired stage records a joining date");

  const eng1 = await one(`select * from refresh_reward_states()`);
  check(Number(eng1.created) === 1, "a reward row is created");

  let w = await one(
    `select id, status, amount, eligible_from from referral_rewards where referral_id=$1`, [a]);
  check(w.amount === 12000, "at the amount snapshotted on the referral");
  // 40 days elapsed against a 30-day window, so it should already be eligible.
  check(w.status === "eligible", `and is eligible right away (got ${w.status})`);

  console.log("\nrunning the engine again changes nothing");
  const eng2 = await one(`select * from refresh_reward_states()`);
  check(Number(eng2.created) === 0 && Number(eng2.became_eligible) === 0,
    "it is idempotent — the cron runs it every night");

  // ---------------------------------------------------------------------
  console.log("\napproval");
  const bad = await one(`select count(*)::int n from referral_rewards where id=$1 and status='paid'`, [w.id]);
  check(bad.n === 0, "an eligible reward is not already paid");

  let threw = null;
  try {
    await db.query(`select mark_reward_paid($1,$2,$3)`, [w.id, "X", admId]);
  } catch (e) { threw = e.message; }
  check(threw !== null, "a reward cannot skip approval and go straight to paid");

  await db.query(`select approve_reward($1,$2)`, [w.id, admId]);
  w = await one(`select status, approved_by, approved_at from referral_rewards where id=$1`, [w.id]);
  check(w.status === "approved", "approving moves it to approved");
  check(w.approved_by === admId, "and records who did it");

  // ---------------------------------------------------------------------
  console.log("\nthe audit trail");
  const events = (await db.query(
    `select from_status, to_status, actor from reward_events
      where reward_id=(select id from referral_rewards where referral_id=$1)
      order by occurred_at`, [a])).rows;
  check(events.length >= 3, `every move is recorded (${events.length} events)`);
  check(events.some((e) => e.to_status === "approved" && e.actor === ADMIN),
    "including who approved it, by name");

  // ---------------------------------------------------------------------
  console.log("\npaying");
  const rw = await one(`select id from referral_rewards where referral_id=$1`, [a]);
  await db.query(`select mark_reward_paid($1,$2,$3)`, [rw.id, "Oct payroll", admId]);
  const paid = await one(`select status, paid_reference, paid_at from referral_rewards where id=$1`, [rw.id]);
  check(paid.status === "paid", "marks it paid");
  check(paid.paid_reference === "Oct payroll", "with the payroll reference");
  check(paid.paid_at !== null, "and when");

  // ---------------------------------------------------------------------
  console.log("\na reward nobody agreed to cannot be approved");
  const jobB = await mkJob(false, 30);   // reward_confirmed = false
  created.jobs.push(jobB);
  const b = await refer(jobB, 2);
  await db.query(`select record_referral_stage($1,'Hired',$2,'keka')`, [
    b, new Date(Date.now() - 40 * 864e5).toISOString(),
  ]);
  await one(`select * from refresh_reward_states()`);
  const wb = await one(`select id, status from referral_rewards where referral_id=$1`, [b]);
  check(wb.status === "eligible", "it still becomes eligible");

  let refused = null;
  try {
    await db.query(`select approve_reward($1,$2)`, [wb.id, admId]);
  } catch (e) { refused = e.message; }
  check(refused !== null && /agreed reward/i.test(refused),
    "but approval is refused until a real reward is set");

  // ---------------------------------------------------------------------
  console.log("\nthe qualifying period actually gates things");
  const jobC = await mkJob(true, 90);
  created.jobs.push(jobC);
  const c = await refer(jobC, 3);
  await db.query(`select record_referral_stage($1,'Hired',now(),'keka')`, [c]);
  await one(`select * from refresh_reward_states()`);
  const wc = await one(
    `select status, eligible_from from referral_rewards where referral_id=$1`, [c]);
  check(wc.status === "pending_joining", "a fresh joiner waits out the period");
  const days = Math.round((new Date(wc.eligible_from) - Date.now()) / 864e5);
  check(days > 85 && days < 92, `eligible in about 90 days (got ${days})`);

  // ---------------------------------------------------------------------
  console.log("\nwhat the employee is told they have earned");
  const totals = await one(
    `select coalesce(sum(w.amount) filter (
              where w.status in ('eligible','approved','paid')
                and r.reward_confirmed_snapshot), 0)::int as earned
       from referrals r left join referral_rewards w on w.referral_id = r.id
      where r.referrer_id = $1`, [refId]);
  // 12,000 paid on jobA. jobB is unagreed, jobC still qualifying.
  check(totals.earned === 12000,
    `only agreed, reached amounts are counted (got ${totals.earned})`);

  console.log("\nmilestones");
  const ms = await one(
    `select count(*)::int n from referrals where referrer_id=$1 and joined_at is not null`,
    [refId]);
  check(ms.n === 3, "counted on people who joined, not referrals made");
} finally {
  for (const id of created.referrals) {
    await db.query(
      `delete from reward_events where reward_id in
         (select id from referral_rewards where referral_id=$1)`, [id]);
    await db.query(`delete from referral_rewards where referral_id=$1`, [id]);
    await db.query(`delete from referral_stages where referral_id=$1`, [id]);
    const c = await one(`select candidate_id from referrals where id=$1`, [id]);
    await db.query(`delete from referrals where id=$1`, [id]);
    if (c) await db.query(`delete from candidates where id=$1`, [c.candidate_id]);
  }
  for (const id of created.jobs) await db.query(`delete from jobs where id=$1`, [id]);
  for (const id of created.employees) await db.query(`delete from employees where id=$1`, [id]);
  const left = await one(`select count(*)::int n from referrals`);
  console.log(`\ncleanup done, referrals remaining: ${left.n}`);
  await db.end();
}

console.log(
  failures ? `\nFAIL — ${failures} check(s) failed\n` : "\nPASS — the reward ledger holds\n",
);
process.exit(failures ? 1 : 0);
