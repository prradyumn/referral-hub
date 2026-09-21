/**
 * Checks the Keka ↔ Hub translation layer.
 *
 *   node scripts/keka-mapping-check.mjs
 *
 * Needs no database, no network and no credentials: it imports the real
 * functions from src/lib/keka/map.ts (Node strips the types) and runs them
 * against the shapes Keka's documentation describes.
 *
 * This is the layer most likely to be wrong against a real tenant, and the
 * one a live smoke test would exercise last. Worth having it standalone.
 */

import assert from "node:assert/strict";
import {
  locationLabel, experienceLabel, summaryText, postedOn, parseKekaDate,
  splitName, splitPhone, candidateBody, attributionNote, extractCandidateId,
  stripBoilerplate,
} from "../src/lib/keka/map.ts";

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message.split("\n").join("\n        ")}`);
  }
}

console.log("\njob locations");
check("single location uses its name", () =>
  assert.equal(locationLabel({ id: "1", jobLocations: [{ name: "Noida" }] }), "Noida"));
check("two locations are joined", () =>
  assert.equal(
    locationLabel({ id: "1", jobLocations: [{ name: "Noida" }, { name: "Bengaluru" }] }),
    "Noida / Bengaluru"));
check("three or more collapse to a count", () =>
  assert.equal(
    locationLabel({ id: "1", jobLocations: [{ name: "Noida" }, { name: "Pune" }, { name: "Patna" }] }),
    "Noida +2 more"));
check("falls back to city and state", () =>
  assert.equal(
    locationLabel({ id: "1", jobLocations: [{ city: "Bhopal", state: "MP" }] }),
    "Bhopal, MP"));
check("duplicates collapse", () =>
  assert.equal(
    locationLabel({ id: "1", jobLocations: [{ name: "Noida" }, { name: "Noida" }] }),
    "Noida"));
check("no locations is Unspecified, never empty", () =>
  assert.equal(locationLabel({ id: "1" }), "Unspecified"));

console.log("\nexperience");
check("a string with a unit passes through", () =>
  assert.equal(experienceLabel({ id: "1", experience: "3-6 yrs" }), "3-6 yrs"));
check("real tenant: a bare range gains a unit", () =>
  assert.equal(experienceLabel({ id: "1", experience: "3-5" }), "3-5 yrs"));
check("real tenant: a bare number gains a unit", () =>
  assert.equal(experienceLabel({ id: "1", experience: "3" }), "3 yrs"));
check("real tenant: spaced range is tidied", () =>
  assert.equal(experienceLabel({ id: "1", experience: "10 - 14" }), "10-14 yrs"));
check("real tenant: \"5 years\" is left alone", () =>
  assert.equal(experienceLabel({ id: "1", experience: "5 years" }), "5 years"));
check("min and max become a band", () =>
  assert.equal(experienceLabel({ id: "1", experience: { min: 3, max: 6 } }), "3-6 yrs"));
check("min alone becomes open-ended", () =>
  assert.equal(experienceLabel({ id: "1", experience: { min: 5 } }), "5+ yrs"));
check("zero min is not treated as absent", () =>
  assert.equal(experienceLabel({ id: "1", experience: { min: 0, max: 2 } }), "0-2 yrs"));
check("missing is Not specified", () =>
  assert.equal(experienceLabel({ id: "1" }), "Not specified"));

console.log("\ndescription → summary");
check("HTML tags are stripped", () =>
  assert.equal(summaryText("<p>Build <b>pipelines</b>.</p>"), "Build pipelines."));
check("entities are decoded", () =>
  assert.equal(summaryText("<p>Data &amp; Insights</p>"), "Data & Insights"));
check("a script tag cannot survive into the page", () => {
  const out = summaryText("<script>alert(1)</script>Hello");
  assert.ok(!out.includes("<"), `markup leaked: ${out}`);
  assert.ok(!out.toLowerCase().includes("script>"), `markup leaked: ${out}`);
});
check("long text is cut on a word boundary", () => {
  const out = summaryText("word ".repeat(200), 50);
  assert.ok(out.length <= 52, `too long: ${out.length}`);
  assert.ok(out.endsWith("…"), out);
  assert.ok(!out.includes("wor…"), `cut mid-word: ${out}`);
});
check("empty and undefined are null, not empty string", () => {
  assert.equal(summaryText(undefined), null);
  assert.equal(summaryText("   "), null);
  assert.equal(summaryText("<p></p>"), null);
});

console.log("\nKeka date parsing (epoch seconds in a string — real tenant format)");
check("epoch seconds with decimals", () =>
  assert.equal(parseKekaDate("1789573328.01").toISOString().slice(0, 10), "2026-09-16"));
check("epoch seconds without decimals", () =>
  assert.equal(parseKekaDate("1791936000").toISOString().slice(0, 10), "2026-10-14"));
check("epoch milliseconds", () =>
  assert.equal(parseKekaDate(1789573328010).toISOString().slice(0, 10), "2026-09-16"));
check("an ISO string still works", () =>
  assert.equal(parseKekaDate("2026-09-01T10:00:00Z").toISOString().slice(0, 10), "2026-09-01"));
check("empty string is null, not the epoch", () => {
  assert.equal(parseKekaDate(""), null);
  assert.equal(parseKekaDate("   "), null);
  assert.equal(parseKekaDate(null), null);
  assert.equal(parseKekaDate(undefined), null);
});
check("zero is null rather than 1970", () => assert.equal(parseKekaDate("0"), null));

console.log("\nboilerplate stripping (45% of tenant descriptions open with it)");
check("real tenant preamble is dropped at the role heading", () => {
  const real =
    "Does working for 150+ million children of Bharat excite you? Then this " +
    "opportunity is for you! About us: ConveGenius is an impact-first organisation, " +
    "building platforms and systems for public education and skilling at population " +
    "scale. Role Summary We are looking for a DevOps Lead to own our deployment " +
    "pipeline and cloud infrastructure end to end.";
  const out = stripBoilerplate(real);
  assert.ok(out.startsWith("Role Summary"), out.slice(0, 60));
  assert.ok(!out.includes("About us"), "boilerplate survived");
});
check("a description with no preamble is untouched", () => {
  const clean = "Role Summary We are looking for a skilled Data Engineer to design and build.";
  assert.equal(stripBoilerplate(clean), clean);
});
check("preamble with no role heading is left alone, not emptied", () => {
  const noHeading =
    "Does working for 150+ million children of Bharat excite you? About us: " +
    "ConveGenius builds education infrastructure across India and beyond.";
  assert.equal(stripBoilerplate(noHeading), noHeading);
});
check("summaryText applies it end to end", () => {
  const html =
    "<p>Does working for 150+ million children of Bharat excite you? About us: " +
    "ConveGenius is an impact-first organisation working at population scale.</p>" +
    "<p>Key Responsibilities Own the release pipeline and the on-call rota.</p>";
  const out = summaryText(html);
  assert.ok(out.startsWith("Key Responsibilities"), out.slice(0, 60));
});

console.log("\nposted date");
check("real tenant shape: epoch createdOn, empty publishedOn", () =>
  assert.equal(postedOn({ id: "1", createdOn: "1789573328.01", publishedOn: "" }),
    "2026-09-16"));
check("publishedOn wins over createdOn", () =>
  assert.equal(
    postedOn({ id: "1", publishedOn: "2026-09-01T10:00:00Z", createdOn: "2026-08-01T10:00:00Z" }),
    "2026-09-01"));
check("createdOn is the fallback", () =>
  assert.equal(postedOn({ id: "1", createdOn: "2026-08-15T00:00:00Z" }), "2026-08-15"));
check("garbage is null, not Invalid Date", () =>
  assert.equal(postedOn({ id: "1", publishedOn: "not a date" }), null));

console.log("\nname split");
check("two parts", () =>
  assert.deepEqual(splitName("Priya Sharma"), { firstName: "Priya", lastName: "Sharma" }));
check("three parts keep the surname last", () =>
  assert.deepEqual(splitName("Rohit Kumar Deshmukh"),
    { firstName: "Rohit Kumar", lastName: "Deshmukh" }));
check("a single name does not invent a surname", () =>
  assert.deepEqual(splitName("Madonna"), { firstName: "Madonna", lastName: "" }));
check("extra whitespace is handled", () =>
  assert.deepEqual(splitName("  Meera   Nair  "), { firstName: "Meera", lastName: "Nair" }));
check("empty does not throw", () =>
  assert.deepEqual(splitName(""), { firstName: "Unknown", lastName: "" }));

console.log("\nphone split");
check("E.164 Indian mobile splits correctly", () =>
  assert.deepEqual(splitPhone("+919876543210"), { countryCode: "+91", number: "9876543210" }));
check("a bare ten-digit number defaults to +91", () =>
  assert.deepEqual(splitPhone("9876543210"), { countryCode: "+91", number: "9876543210" }));
check("a non-Indian code is preserved, not forced to +91", () =>
  assert.deepEqual(splitPhone("+14155550123"), { countryCode: "+1", number: "4155550123" }));

console.log("\ncandidate body");
const referral = {
  referral_id: "r1", ref_code: "REF-ABCD1234", keka_job_id: "job-1", job_title: "Data Analyst",
  candidate_name: "Priya Sharma", candidate_email: "priya.sharma@example.com",
  candidate_phone: "+919876543210", current_org: "Acme", current_designation: "Analyst",
  linkedin_url: "https://linkedin.com/in/priya", relationship: "Former colleague",
  referrer_name: "Imran Qureshi", referrer_email: "imran@convegenius.ai", attempts: 0,
};
check("core fields are mapped", () => {
  const b = candidateBody(referral);
  assert.equal(b.firstName, "Priya");
  assert.equal(b.lastName, "Sharma");
  assert.equal(b.email, "priya.sharma@example.com");
  assert.deepEqual(b.phone, ["+91", "9876543210"]);
});
check("optional fields are omitted rather than sent null", () => {
  const b = candidateBody({
    ...referral, current_org: null, current_designation: null, linkedin_url: null,
  });
  assert.ok(!("linkedInUrl" in b), "linkedInUrl should be absent");
  assert.ok(!("experienceDetails" in b), "experienceDetails should be absent");
});
check("employer becomes experienceDetails", () => {
  const b = candidateBody(referral);
  assert.equal(b.experienceDetails[0].companyName, "Acme");
  assert.equal(b.experienceDetails[0].isCurrentlyWorking, true);
});
check("the body carries no reward or consent text", () => {
  // Reward amounts are internal, and the consent notice is the Hub's record.
  // Neither belongs in an ATS candidate record.
  const json = JSON.stringify(candidateBody(referral));
  assert.ok(!/reward/i.test(json), "reward leaked into the Keka payload");
  assert.ok(!/consent/i.test(json), "consent text leaked into the Keka payload");
});

console.log("\nattribution note");
check("names the referrer and the ref code", () => {
  const n = attributionNote(referral);
  assert.ok(n.includes("Imran Qureshi"), n);
  assert.ok(n.includes("imran@convegenius.ai"), n);
  assert.ok(n.includes("REF-ABCD1234"), n);
});
check("falls back to the email when the name is missing", () => {
  const n = attributionNote({ ...referral, referrer_name: null });
  assert.ok(n.includes("imran@convegenius.ai"), n);
});

console.log("\ncandidate id extraction");
check("a bare string", () => assert.equal(extractCandidateId("cand-1"), "cand-1"));
check("an { id } object", () => assert.equal(extractCandidateId({ id: "cand-2" }), "cand-2"));
check("a { data: { id } } envelope", () =>
  assert.equal(extractCandidateId({ succeeded: true, data: { id: "cand-3" } }), "cand-3"));
check("unreadable shapes return null rather than a wrong id", () => {
  assert.equal(extractCandidateId({ succeeded: true }), null);
  assert.equal(extractCandidateId(null), null);
  assert.equal(extractCandidateId(""), null);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
