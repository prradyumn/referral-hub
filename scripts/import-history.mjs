/**
 * Loads HR's referral-bonus sheet into historical_referrals, for the leaderboard.
 *
 *   node --env-file=.env.local scripts/import-history.mjs [file.csv] [--dry-run]
 *
 * Default file: Referral_Data_CSVs/Copy_of_sheet_3.csv — the master sheet.
 * That folder is gitignored and must stay so: it holds real names.
 *
 * Columns (matched ignoring case and spacing):
 *   Candidate Name   used only to derive a key; NOT stored (db/0019)
 *   DoJ              joining date — what the leaderboard counts by
 *   Referred date    optional
 *   Recruiter        the employee who made the referral and was paid for it
 *   Recruiter Designation, Amount INR, Status
 *
 * "Recruiter" is the referrer, not a TA recruiter: it is who the bonus in
 * Amount INR and Status was paid to, and none of those people hold a
 * recruitment title. If a sheet ever uses it differently, this is the line to
 * change.
 *
 * All or nothing, in one transaction. Re-running updates rather than
 * duplicates. An unrecognised Status stops the import: it decides whether a
 * bonus counts as earned, so it is not guessed. Prints counts, never names.
 */

import { readFileSync } from "node:fs";
import pg from "pg";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const file = args.find((a) => !a.startsWith("--")) ?? "Referral_Data_CSVs/Copy_of_sheet_3.csv";
const source = `hr-sheet:${file.split("/").pop()}`;

// ------------------------------------------------------------------ CSV
/** RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const norm = (h) => h.toLowerCase().replace(/[^a-z]/g, "");
const COLUMNS = {
  candidate: "candidatename",
  joined: "doj",
  referred: "referreddate",
  referrer: "recruiter",
  designation: "recruiterdesignation",
  amount: "amountinr",
  status: "status",
};
const REQUIRED = ["candidate", "joined", "referrer", "status"];

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** A calendar date as YYYY-MM-DD, or null. Excel exports, ISO, "12 Sept 2025", DD/MM/YYYY. */
function parseDate(raw) {
  const v = (raw ?? "").trim();
  if (!v) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.exec(v);
  let y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[\s-]+([A-Za-z]{3,4})[a-z]*[\s-]+(\d{4})$/.exec(v)) && MONTHS[m[2].toLowerCase()]) {
    [d, mo, y] = [+m[1], MONTHS[m[2].toLowerCase()], +m[3]];
  } else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v))) [d, mo, y] = [+m[1], +m[2], +m[3]]; // Indian order
  else return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === iso ? iso : null;
}

function parseAmount(raw) {
  const v = (raw ?? "").trim().replace(/[₹,\s]/g, "");
  if (!v || /^(n\/?a|nil|-|—)$/i.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined; // undefined = unreadable, reported
  return Math.round(n);
}

const STATUS = { paid: "paid", notyetpaid: "owed", employeeexited: "forfeited" };

/** "RAHUL KUMAR" and "rahul kumar" become "Rahul Kumar"; mixed case is left as HR wrote it. */
function displayName(raw) {
  const v = raw.trim().replace(/\s+/g, " ");
  const letters = v.replace(/[^A-Za-z]/g, "");
  if (letters && letters !== letters.toUpperCase() && letters !== letters.toLowerCase()) return v;
  return v.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------- read
const rows = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, ""));
const header = rows[0].map(norm);
const at = Object.fromEntries(Object.entries(COLUMNS).map(([k, h]) => [k, header.indexOf(h)]));
const missing = REQUIRED.filter((k) => at[k] < 0);
if (missing.length) {
  console.error(`Missing column(s): ${missing.map((k) => COLUMNS[k]).join(", ")}. Found: ${rows[0].join(" | ")}`);
  process.exit(1);
}

const get = (r, k) => (at[k] >= 0 ? (r[at[k]] ?? "").trim() : "");
const unknownStatuses = new Set();
const problems = [];
const records = [];

rows.slice(1).forEach((r, i) => {
  const line = i + 2;
  const statusRaw = get(r, "status");
  const payout = STATUS[norm(statusRaw)];
  if (!payout) unknownStatuses.add(statusRaw || "(blank)");

  const joined = parseDate(get(r, "joined"));
  const amount = parseAmount(get(r, "amount"));
  if (!get(r, "candidate")) problems.push(`line ${line}: no candidate name`);
  else if (!get(r, "referrer")) problems.push(`line ${line}: no referrer`);
  else if (!joined) problems.push(`line ${line}: unreadable joining date "${get(r, "joined")}"`);
  else if (amount === undefined) problems.push(`line ${line}: unreadable amount "${get(r, "amount")}"`);
  else if (payout) {
    records.push({
      candidate: get(r, "candidate"),
      referrer: displayName(get(r, "referrer")),
      designation: get(r, "designation"),
      referred: parseDate(get(r, "referred")),
      joined,
      amount,
      payout,
    });
  }
});

if (unknownStatuses.size) {
  console.error(
    `Unrecognised Status value(s): ${[...unknownStatuses].map((s) => `"${s}"`).join(", ")}.\n` +
      `Known: "Paid", "Not yet paid", "Employee Exited". Nothing was imported — ` +
      `add the new value to STATUS in this script once you know whether it means paid, owed or forfeited.`,
  );
  process.exit(1);
}
if (problems.length) {
  console.error(`${problems.length} row(s) could not be read — nothing was imported:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

// --------------------------------------------------------------- summary
const byStatus = records.reduce((a, r) => ((a[r.payout] = (a[r.payout] ?? 0) + 1), a), {});
const joins = records.map((r) => r.joined).sort();
const referrers = new Set(records.map((r) => r.referrer.toLowerCase().replace(/[^a-z]/g, "")));
console.log(`${file}`);
console.log(`  ${records.length} referrals by ${referrers.size} referrers, joined ${joins[0]} → ${joins.at(-1)}`);
console.log(`  payout: ${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(", ")}`);
console.log(`  bonus total recorded: ₹${records.reduce((a, r) => a + (r.amount ?? 0), 0).toLocaleString("en-IN")}`);

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
  process.exit(0);
}

// ---------------------------------------------------------------- write
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const tally = { inserted: 0, updated: 0 };
try {
  await db.query("begin");
  for (const r of records) {
    const { rows: out } = await db.query(
      `select import_historical_referral($1, $2, $3, $4, $5, $6, $7, $8) as result`,
      [r.candidate, r.referrer, r.designation, r.referred, r.joined, r.amount, r.payout, source],
    );
    tally[out[0].result]++;
  }
  await db.query("commit");
} catch (e) {
  await db.query("rollback");
  console.error(`\nImport failed and was rolled back: ${e.message}`);
  process.exit(1);
} finally {
  await db.end();
}
console.log(`\nimported: ${tally.inserted} new, ${tally.updated} updated (source "${source}")`);
