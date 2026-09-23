/**
 * Proves the Keka stage pipeline: matching, idempotency, and that an
 * unrecognised stage is never shown to an employee.
 *
 *   node --env-file=.env.local scripts/e2e-stages.mjs
 *
 * Uses a synthetic candidate rather than a real one from Keka. The Keka side
 * of the contract — that candidates come back with jobHiringStageId and
 * movedtoStageOn — is verified separately by scripts/keka-discover.mjs; what
 * needs testing here is our matching and display logic, and that does not
 * justify pulling a real person's details into the database.
 *
 * Creates and deletes everything it touches.
 */

import pg from "pg";

const TAG = Date.now();
const EMPLOYEE = `e2e_stages_${TAG}@convegenius.ai`;
// Plus-addressed and mixed case on purpose: normalise_email must reconcile
// what Keka sends with what submit_referral stored.
const CAND_STORED = `  Stage.Test+keka${TAG}@Example.COM `;
const CAND_FROM_KEKA = `stage.test+other${TAG}@example.com`;

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
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

let referralId = null;
let employeeId = null;

try {
  const job = await one(
    `select id, keka_job_id from jobs
      where source='keka' and keka_job_id is not null and is_open limit 1`,
  );
  if (!job) throw new Error("No synced Keka job to test against — run the jobs sync first.");

  employeeId = (await one(
    `insert into employees (email, full_name) values ($1,$2) returning id`,
    [EMPLOYEE, "E2E Stages"],
  )).id;

  const submitted = await one(
    `select * from submit_referral($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [employeeId, job.id, "Stage Test", CAND_STORED, "9000000042",
     "Acme", "Analyst", null, "Friend", "consent recorded for the e2e test"],
  );
  referralId = (await one(`select id from referrals where ref_code=$1`, [submitted.ref_code])).id;

  console.log(`\nreferral ${submitted.ref_code} against Keka job ${job.keka_job_id}`);

  const applyStage = (stage, when) =>
    one(`select * from apply_keka_candidate_stages($1::jsonb)`, [
      JSON.stringify([{
        keka_job_id: job.keka_job_id,
        email: CAND_FROM_KEKA,
        keka_candidate_id: `e2e-cand-${TAG}`,
        stage,
        occurred_at: when,
      }]),
    ]);

  const stageRows = async () =>
    (await db.query(
      `select stage, source from referral_stages where referral_id=$1 order by occurred_at, id`,
      [referralId],
    )).rows;

  console.log("\nmatching");
  check((await stageRows()).length === 1, "submit_referral left exactly one stage row");

  const r1 = await applyStage("Shortlisted", "2026-09-18T10:00:00Z");
  check(Number(r1.matched) === 1, "matched the referral despite plus-addressing and case");
  check(Number(r1.advanced) === 1, "recorded the new stage");

  const afterFirst = await one(
    `select current_stage, keka_candidate_id, keka_last_seen_at from referrals where id=$1`,
    [referralId],
  );
  check(afterFirst.current_stage === "Profile shortlisted",
    `current_stage uses the mapped wording (got "${afterFirst.current_stage}")`);
  check(afterFirst.keka_candidate_id === `e2e-cand-${TAG}`, "stored the Keka candidate id");
  check(afterFirst.keka_last_seen_at !== null, "recorded when Keka last saw them");

  console.log("\nidempotency — the sync runs hourly");
  const r2 = await applyStage("Shortlisted", "2026-09-18T10:00:00Z");
  check(Number(r2.matched) === 1, "still matches on a re-run");
  check(Number(r2.advanced) === 0, "does NOT append the same stage twice");
  check((await stageRows()).length === 2, "still two stage rows, not three");

  console.log("\na referral taken out of the process in Keka");
  const rArc = await applyStage("Archived", "2026-09-19T09:00:00Z");
  check(Number(rArc.advanced) === 1, "an Archived candidate is recorded");
  const afterArc = await one(`select current_stage from referrals where id=$1`, [referralId]);
  check(afterArc.current_stage === "No longer in process",
    `the employee is told it closed (got "${afterArc.current_stage}")`);
  check(!/reject|reason|feedback/i.test(afterArc.current_stage),
    "and never why — the reason stays in Keka");

  console.log("\nan unrecognised stage");
  const weird = `Bespoke Stage ${TAG}`;
  const r3 = await applyStage(weird, "2026-09-19T10:00:00Z");
  check(Number(r3.advanced) === 1, "is recorded in referral_stages");
  const afterWeird = await one(`select current_stage from referrals where id=$1`, [referralId]);
  check(afterWeird.current_stage === "No longer in process",
    "does NOT become the employee-facing status — the Hub invents no wording");
  const parked = await one(
    `select is_visible, employee_wording from keka_stage_map where keka_stage_id=$1`, [weird]);
  check(parked && parked.is_visible === false, "is parked in keka_stage_map for a human");
  check(parked && parked.employee_wording === null, "with no wording invented for it");

  const visible = (await db.query(
    `select s.stage from referral_stages s
       left join keka_stage_map m on m.keka_stage_id = s.stage
      where s.referral_id=$1 and (m.is_visible is true or s.source='hub')`,
    [referralId],
  )).rows.map((r) => r.stage);
  check(!visible.includes(weird), "and is filtered out of the employee's journey");

  console.log("\nsomebody else's candidate");
  const r4 = await one(`select * from apply_keka_candidate_stages($1::jsonb)`, [
    JSON.stringify([{
      keka_job_id: job.keka_job_id,
      email: `stranger_${TAG}@example.com`,
      keka_candidate_id: "not-ours",
      stage: "Shortlisted",
      occurred_at: "2026-09-20T10:00:00Z",
    }]),
  ]);
  check(Number(r4.matched) === 0, "a Keka candidate nobody here referred is ignored");
} finally {
  if (referralId) {
    await db.query(`delete from referral_stages where referral_id=$1`, [referralId]);
    const c = await db.query(`select candidate_id from referrals where id=$1`, [referralId]);
    await db.query(`delete from referrals where id=$1`, [referralId]);
    if (c.rows[0]) await db.query(`delete from candidates where id=$1`, [c.rows[0].candidate_id]);
  }
  if (employeeId) await db.query(`delete from employees where id=$1`, [employeeId]);
  await db.query(`delete from keka_stage_map where keka_stage_id like 'Bespoke Stage %'`);
  const left = await one(`select count(*)::int n from referrals`);
  console.log(`\ncleanup done, referrals remaining: ${left.n}`);
  await db.end();
}

console.log(failures ? `\nFAIL — ${failures} check(s) failed\n` : "\nPASS — stage pipeline is sound\n");
process.exit(failures ? 1 : 0);
