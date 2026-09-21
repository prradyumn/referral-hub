/**
 * Proves a referral never shows an amount nobody agreed to.
 *
 *   npm run e2e:rewards
 *
 * The case this exists for: Keka has no concept of a referral reward, so a
 * synced role arrives with a placeholder. If someone refers against that role
 * and HR later sets a different figure, the employee must not suddenly see
 * the placeholder presented as a real, agreed number.
 *
 * Creates and deletes everything it touches.
 */

import pg from "pg";

const TAG = Date.now();
const EMPLOYEE = `e2e_reward_${TAG}@convegenius.ai`;

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

let empId = null;
let jobId = null;
const refIds = [];

try {
  empId = (
    await one(`insert into employees (email, full_name) values ($1,$2) returning id`, [
      EMPLOYEE,
      "E2E Reward",
    ])
  ).id;

  // A role exactly as the Keka sync creates one: placeholder reward, unconfirmed.
  jobId = (
    await one(
      `insert into jobs (keka_job_id, source, req_id, title, department, location,
                         experience_band, is_open, reward_amount, eligibility_days,
                         reward_confirmed)
       values ($1,'keka',$2,'E2E Role','Testing','Noida','1-2 yrs',true,10000,30,false)
       returning id`,
      [`e2e-job-${TAG}`, `E2EJOB${TAG}`],
    )
  ).id;

  const refer = async (n) => {
    const r = await one(`select * from submit_referral($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
      empId,
      jobId,
      `Cand ${n}`,
      `e2e.rew.${n}.${TAG}@example.com`,
      `90000${String(n).padStart(5, "0")}`,
      null,
      null,
      null,
      "Friend",
      "consent recorded for the e2e test",
    ]);
    const row = await one(`select id from referrals where ref_code=$1`, [r.ref_code]);
    refIds.push(row.id);
    return row.id;
  };

  console.log("\nreferral taken while the reward was unset");
  const before = await refer(1);
  const b = await one(
    `select reward_amount_snapshot a, reward_confirmed_snapshot c from referrals where id=$1`,
    [before],
  );
  check(b.c === false, "is marked as having no agreed reward");
  check(b.a === 10000, "snapshots the placeholder amount for the record");

  console.log("\nHR then sets a real reward of 15,000");
  const res = await one(`select * from set_job_reward($1,$2,$3,$4)`, [jobId, 15000, 45, true]);
  check(Number(res.referrals_settled) === 1, "the earlier referral is settled");

  const after = await one(
    `select reward_amount_snapshot a, eligibility_days_snapshot d, reward_confirmed_snapshot c
       from referrals where id=$1`,
    [before],
  );
  check(after.c === true, "it now counts as agreed");
  check(
    after.a === 15000,
    `it shows the real 15,000, not the 10,000 placeholder (got ${after.a})`,
  );
  check(after.d === 45, "and the real eligibility window");

  console.log("\na referral taken after the reward was agreed");
  const later = await refer(2);
  const l = await one(
    `select reward_amount_snapshot a, reward_confirmed_snapshot c from referrals where id=$1`,
    [later],
  );
  check(l.c === true, "is agreed from the start");
  check(l.a === 15000, "at the agreed rate");

  console.log("\nchanging the rate again must NOT rewrite it (convention 3)");
  await one(`select * from set_job_reward($1,$2,$3,$4)`, [jobId, 25000, 45, true]);
  const l2 = await one(`select reward_amount_snapshot a from referrals where id=$1`, [later]);
  check(l2.a === 15000, `the promise made at 15,000 is kept (got ${l2.a})`);
  const b2 = await one(`select reward_amount_snapshot a from referrals where id=$1`, [before]);
  check(b2.a === 15000, "and the settled one is not bumped again either");
} finally {
  for (const id of refIds) {
    await db.query(`delete from referral_stages where referral_id=$1`, [id]);
    const c = await one(`select candidate_id from referrals where id=$1`, [id]);
    await db.query(`delete from referrals where id=$1`, [id]);
    if (c) await db.query(`delete from candidates where id=$1`, [c.candidate_id]);
  }
  if (jobId) await db.query(`delete from jobs where id=$1`, [jobId]);
  if (empId) await db.query(`delete from employees where id=$1`, [empId]);
  const left = await one(`select count(*)::int n from referrals`);
  console.log(`\ncleanup done, referrals remaining: ${left.n}`);
  await db.end();
}

console.log(
  failures
    ? `\nFAIL — ${failures} check(s) failed\n`
    : "\nPASS — rewards shown are only ones actually agreed\n",
);
process.exit(failures ? 1 : 0);
