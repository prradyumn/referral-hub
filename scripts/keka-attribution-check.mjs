/**
 * Who referred a Keka candidate — the rules, checked without a database,
 * network or credentials.
 *
 *   node scripts/keka-attribution-check.mjs      (or npm run keka:attribution)
 *
 * Imports the real functions from src/lib/keka/attribution.ts; Node strips
 * the types. A reward follows from these decisions, so the checks that matter
 * most are the ones proving what is NOT credited: a hiring manager's address
 * in another field, a recruiter in sourcedBy, a lookalike domain.
 */

import assert from "node:assert/strict";
import {
  isEmployeeReferral,
  candidateName,
  fieldNames,
  referrerFrom,
  suggestEmployee,
  importCutoff,
  triage,
} from "../src/lib/keka/attribution.ts";

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${e.message.split("\n")[0]}`);
  }
}

const D = "convegenius.ai";
const FIELD = "Referrer work email";
const ref = (extra = {}, details = {}) => ({
  id: "c1",
  firstName: "Asha",
  lastName: "Verma",
  email: "asha@example.com",
  jobApplicationDetails: { sourceTitle: "Employee Referral", ...details },
  ...extra,
});

console.log("\nWhat counts as a Keka referral");
check("'Employee Referral' is one", () => assert.equal(isEmployeeReferral(ref()), true));
check("regardless of case and spacing", () => {
  for (const t of ["employee referral", " EMPLOYEE REFERRAL ", "Employee-Referral", "EmployeeReferral"]) {
    assert.equal(isEmployeeReferral(ref({}, { sourceTitle: t })), true, t);
  }
});
check("other sources are not", () => {
  for (const t of ["Career Portal", "Consultant", "Indeed Job Posts", "Referral Agency", "", undefined]) {
    assert.equal(isEmployeeReferral(ref({}, { sourceTitle: t })), false, String(t));
  }
});
check("no application details at all is not", () =>
  assert.equal(isEmployeeReferral({ id: "x", jobApplicationDetails: null }), false));

console.log("\nCandidate name and fields");
check("first, middle and last joined", () =>
  assert.equal(candidateName({ firstName: " Asha ", middleName: "K", lastName: "Verma" }), "Asha K Verma"));
check("missing parts skipped", () => assert.equal(candidateName({ firstName: "Asha" }), "Asha"));
check("field NAMES from both custom fields and screening answers, sorted", () => {
  const c = ref({ additionalCandidateDetails: { "Notice period": "30", [FIELD]: "g@convegenius.ai" } },
    { screeningQuestionsResponse: { "Current CTC": "2400000" } });
  assert.deepEqual(fieldNames(c), ["Current CTC", "Notice period", FIELD]);
});
check("never their values — a salary answer does not leak", () => {
  const c = ref({}, { screeningQuestionsResponse: { "Current CTC": "2400000" } });
  assert.equal(JSON.stringify(fieldNames(c)).includes("2400000"), false);
});

console.log("\nCrediting — only from the configured field");
const withField = (v, where = "custom") =>
  where === "custom"
    ? ref({ additionalCandidateDetails: { [FIELD]: v } })
    : ref({}, { screeningQuestionsResponse: { [FIELD]: v } });

check("nothing is credited while no field is configured", () =>
  assert.deepEqual(referrerFrom(withField("gokul@convegenius.ai"), "", D), { kind: "none" }));
check("a work email in the configured field is credited", () =>
  assert.deepEqual(referrerFrom(withField("gokul@convegenius.ai"), FIELD, D), { kind: "email", email: "gokul@convegenius.ai" }));
check("found in screening answers too", () =>
  assert.deepEqual(referrerFrom(withField("gokul@convegenius.ai", "screening"), FIELD, D), { kind: "email", email: "gokul@convegenius.ai" }));
check("the field name is matched without regard to case or space", () =>
  assert.equal(referrerFrom(withField("gokul@convegenius.ai"), "  referrer WORK email ", D).kind, "email"));
check("the address is lower-cased and trimmed", () =>
  assert.deepEqual(referrerFrom(withField("  Gokul@ConveGenius.AI "), FIELD, D), { kind: "email", email: "gokul@convegenius.ai" }));
check("a personal address is a hint, not a credit", () =>
  assert.equal(referrerFrom(withField("gokul@gmail.com"), FIELD, D).kind, "hint"));
check("a name typed where an email was asked is a hint", () =>
  assert.deepEqual(referrerFrom(withField("Gokul S"), FIELD, D), { kind: "hint", hint: "Gokul S" }));
check("a lookalike domain is NOT credited", () => {
  for (const v of ["x@convegenius.ai.evil.com", "x@evilconvegenius.ai", "x@mail.convegenius.ai"]) {
    assert.equal(referrerFrom(withField(v), FIELD, D).kind, "hint", v);
  }
});
check("an empty field is as if absent", () =>
  assert.deepEqual(referrerFrom(withField("   "), FIELD, D), { kind: "none" }));

console.log("\n…and never from anywhere else");
check("a hiring manager's work email in ANOTHER field is not credited", () => {
  const c = ref({ additionalCandidateDetails: { "Hiring manager": "manager@convegenius.ai" } });
  assert.deepEqual(referrerFrom(c, FIELD, D), { kind: "none" });
});
check("a recruiter's work email in sourcedBy is not credited", () => {
  const c = ref({}, { sourcedBy: "recruiter@convegenius.ai" });
  assert.deepEqual(referrerFrom(c, FIELD, D), { kind: "none" });
});
check("the candidate's own work email is not taken for the referrer's", () => {
  const c = ref({ email: "colleague@convegenius.ai" });
  assert.deepEqual(referrerFrom(c, FIELD, D), { kind: "none" });
});

console.log("\nSuggestions — for an admin, never a credit");
const people = [
  { id: "e1", email: "gokul@convegenius.ai", full_name: "Gokul S" },
  { id: "e2", email: "pradyumn@convegenius.ai", full_name: "PRADYUMN AWASTHI" },
  { id: "e3", email: "priya.a@convegenius.ai", full_name: "Priya Sharma" },
  { id: "e4", email: "priya.b@convegenius.ai", full_name: "Priya Sharma" },
];
check("an exact work email suggests that person", () =>
  assert.equal(suggestEmployee("Gokul@convegenius.ai", people), "e1"));
check("an email that is nobody's suggests no one", () =>
  assert.equal(suggestEmployee("stranger@convegenius.ai", people), null));
check("word order and punctuation do not matter: 'S. Gokul' = 'Gokul S'", () =>
  assert.equal(suggestEmployee("S. Gokul", people), "e1"));
check("case does not matter", () => assert.equal(suggestEmployee("pradyumn awasthi", people), "e2"));
check("a partial name suggests no one", () => assert.equal(suggestEmployee("Gokul", people), null));
check("two people with the same name: no suggestion at all", () =>
  assert.equal(suggestEmployee("Priya Sharma", people), null));
check("nothing to go on: no suggestion", () => {
  for (const v of [null, undefined, "", "   ", "---"]) assert.equal(suggestEmployee(v, people), null, String(v));
});

console.log("\nThe import cutoff");
check("is the start of that day in India", () =>
  assert.equal(importCutoff("2026-09-25").toISOString(), "2026-09-24T18:30:00.000Z"));
check("refuses an empty value rather than importing everything", () =>
  assert.throws(() => importCutoff("")));
check("refuses a malformed date", () => {
  for (const v of ["25-09-2026", "2026/09/25", "yesterday", "2026-9-5"]) assert.throws(() => importCutoff(v), v);
});
check("refuses a date that does not exist", () => assert.throws(() => importCutoff("2026-02-30")));

console.log("\nWhat is brought in at all");
const cut = importCutoff("2026-09-25");
check("a referral made after the cutoff is imported", () =>
  assert.equal(triage(ref(), new Date("2026-09-26T10:00:00Z"), cut), "import"));
check("one made at 00:30 IST on the cutoff day is imported", () =>
  assert.equal(triage(ref(), new Date("2026-09-24T19:00:00Z"), cut), "import"));
check("one made the evening before, IST, is not", () =>
  assert.equal(triage(ref(), new Date("2026-09-24T18:00:00Z"), cut), "before_cutoff"));
check("one with no date is not — it cannot be shown to be after the cutoff", () =>
  assert.equal(triage(ref(), null, cut), "undated"));
check("a candidate Keka did not mark as a referral is not", () =>
  assert.equal(triage(ref({}, { sourceTitle: "Career Portal" }), new Date(), cut), "not_a_referral"));
check("one with no Keka id is not", () =>
  assert.equal(triage(ref({ id: undefined }), new Date(), cut), "not_a_referral"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
