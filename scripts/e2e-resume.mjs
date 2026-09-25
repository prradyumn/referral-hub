/**
 * CV upload, storage, admin download and the access audit — end to end.
 *
 *   node --env-file=.env.local scripts/e2e-resume.mjs     (dev server running)
 *
 * Drives the real referral form in a browser. Proves:
 *
 *   · files that carry the features résumé attacks use are refused, including
 *     a script hidden in a compressed object stream and one hex-obfuscated
 *   · ordinary CVs are NOT refused — a developer's CV that says
 *     "Node/JavaScript", a DOCX with a LinkedIn link. A checker that rejects
 *     good CVs is a checker people route around
 *   · a refused file leaves the user on the form, not bounced to review
 *   · what is stored is byte-for-byte what was uploaded
 *   · only an admin can download it; a non-admin gets 404 and leaves no trace
 *   · every admin download is logged, and the log cannot be changed
 *
 * Creates two temporary employees and their referrals, and deletes them.
 * Audit rows stay: the log is append-only by design, and a download by a test
 * account is still a download. They are identifiable by the e2e_ address.
 */

import { createHash } from "node:crypto";
import { crc32, deflateRawSync, deflateSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { encode } from "next-auth/jwt";
import pg from "pg";

const BASE = process.env.SHOOT_BASE ?? "http://localhost:3000";
const COOKIE = "authjs.session-token";
const RUN = Date.now();
const PLAIN = `e2e_cv_plain_${RUN}@convegenius.ai`;
const ADMIN = `e2e_cv_admin_${RUN}@convegenius.ai`;
const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) failures++;
};
const sha = (b) => createHash("sha256").update(b).digest("hex");

// ------------------------------------------------------------- test files

/** A structurally valid PDF with a correct xref table. */
function pdf(objects, trailerExtra = "") {
  const parts = [Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets = [];
  let len = parts[0].length;
  objects.forEach((o, i) => {
    offsets.push(len);
    const head = `${i + 1} 0 obj\n`;
    const b =
      typeof o === "string"
        ? Buffer.from(`${head}${o}\nendobj\n`, "latin1")
        : Buffer.concat([
            Buffer.from(`${head}${o.dict.replace("LEN", o.stream.length)}\nstream\n`, "latin1"),
            o.stream,
            Buffer.from("\nendstream\nendobj\n", "latin1"),
          ]);
    parts.push(b);
    len += b.length;
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailerExtra}>>\nstartxref\n${len}\n%%EOF\n`;
  parts.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(parts);
}

// Page text deliberately full of the words the checker hunts for. It sits in
// a content stream, which is page drawing, not structure — so it must pass.
const PAGE_TEXT =
  "BT /F1 11 Tf 72 720 Td (Skills: Node/JavaScript (5 yrs), React/JS (3 yrs), " +
  "/Launch planning, /EmbeddedFiles research) Tj ET";

function pageObjects(catalogExtra = "") {
  return [
    `<< /Type /Catalog /Pages 2 0 R ${catalogExtra}>>`,
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
      "/Resources << /Font << /F1 5 0 R >> >> >>",
    { dict: "<< /Length LEN >>", stream: Buffer.from(PAGE_TEXT, "latin1") },
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
}

const objStmBody = Buffer.from("6 0 << /S /JavaScript /JS (app.alert\\(1\\)) >>", "latin1");

const FILES = {
  cleanPdf: pdf(pageObjects()),
  jsAction: pdf(pageObjects("/OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >> ")),
  // The action is only a reference in the catalog; the script itself is
  // compressed inside an object stream, invisible to a scan of raw bytes.
  jsObjStm: pdf([
    ...pageObjects("/OpenAction 6 0 R "),
    { dict: "<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length LEN >>", stream: deflateSync(objStmBody) },
  ]),
  jsHex: pdf(pageObjects("/OpenAction << /S /J#61vaScript /J#53 (app.alert\\(1\\)) >> ")),
  launch: pdf(pageObjects("/OpenAction << /S /Launch /F (cmd.exe) >> ")),
  encrypted: pdf([...pageObjects(), "<< /Filter /Standard /V 1 /R 2 /O (x) /U (y) /P -4 >>"], "/Encrypt 6 0 R "),
  fakePdf: Buffer.from("This is a plain text file with a .pdf name.\n"),
};

/** A real OOXML zip, entries deflated as Word writes them. */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const n = Buffer.from(name);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += local.length + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const TYPES =
  '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const docx = (extra = {}) =>
  zip({
    "[Content_Types].xml": TYPES,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
    // Text mentioning macros is just text.
    "word/document.xml": '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Skills: VBA macros, ActiveX, JavaScript</w:t></w:r></w:p></w:body></w:document>',
    ...extra,
  });

Object.assign(FILES, {
  cleanDocx: docx(),
  hyperlinkDocx: docx({
    "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r9" Type="${R}/hyperlink" Target="https://www.linkedin.com/in/example" TargetMode="External"/></Relationships>`,
  }),
  macroDocx: docx({ "word/vbaProject.bin": "not really vba" }),
  templateDocx: docx({
    "word/_rels/settings.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="${R}/attachedTemplate" Target="http://attacker.example/t.dotm" TargetMode="External"/></Relationships>`,
  }),
});

// ------------------------------------------------------------------ setup

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const push = (await db.query(`select value from app_settings where key = 'keka_push_candidates'`)).rows[0];
if (push?.value === "true") {
  console.log("keka_push_candidates is on — refusing to run: test candidates would go into the live tenant.");
  process.exit(1);
}

const emps = await db.query(
  `insert into employees (email, full_name, is_admin, welcome_ack_at)
   values ($1, 'E2E CV Referrer', false, now()), ($2, 'E2E CV Admin', true, now())
   on conflict (email) do update set is_admin = excluded.is_admin, welcome_ack_at = now()
   returning id, email`,
  [PLAIN, ADMIN],
);
const idOf = Object.fromEntries(emps.rows.map((r) => [r.email, r.id]));

const browser = await chromium.launch();
async function contextFor(email, name) {
  const token = await encode({
    token: { name, email, sub: email, exp: Math.floor(Date.now() / 1000) + 3600 },
    secret: process.env.AUTH_SECRET,
    salt: COOKIE,
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addCookies([{ name: COOKIE, value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  return ctx;
}

const plainCtx = await contextFor(PLAIN, "E2E CV Referrer");
const adminCtx = await contextFor(ADMIN, "E2E CV Admin");
const page = await plainCtx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

const candidates = [];
let n = 0;
function newCandidate() {
  n++;
  const c = {
    name: `ZZ CV Test ${n} ${RUN}`,
    email: `zz-cv-${RUN}-${n}@example.invalid`,
    phone: `9${String(RUN).slice(-7)}${String(n).padStart(2, "0")}`,
  };
  candidates.push(c);
  return c;
}

async function openForm(c) {
  await page.goto(`${BASE}/refer`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    try { localStorage.setItem("referral-hub:welcome-seen", "1"); } catch {}
    document.querySelector("dialog[open]")?.close();
  });
  await page.click("#jobId");
  await page.keyboard.type("a");
  await page.keyboard.press("Enter");
  await page.waitForSelector('button:has-text("Change role")', { timeout: 8000 });
  await page.fill("#fullName", c.name);
  await page.fill("#email", c.email);
  await page.fill("#phone", c.phone);
  await page.selectOption("#relationship", { index: 1 });
  await page.check("#consent");
}

async function attach(name, mimeType, buffer) {
  if (await page.locator('button:has-text("Remove")').count()) {
    await page.click('button:has-text("Remove")');
  }
  await page.setInputFiles("#resume", { name, mimeType, buffer });
}

/** Review then submit. Resolves to "done", or the CV error text. */
async function submit() {
  await page.click('button:has-text("Review referral")');
  await page.waitForSelector('button:has-text("Submit referral")', { timeout: 5000 });
  await page.click('button:has-text("Submit referral")');
  await page.waitForSelector('h1:has-text("Referral submitted"), #resume-error', { timeout: 20000 });
  if (await page.locator('h1:has-text("Referral submitted")').count()) return "done";
  return (await page.locator("#resume-error").textContent())?.trim() ?? "";
}

const referralFor = async (email) =>
  (
    await db.query(
      `select r.id, f.sha256, f.content_type, f.size_bytes, f.file_name, f.av_scanned_at
         from referrals r join candidates c on c.id = r.candidate_id
         left join referral_resumes f on f.referral_id = r.id
        where c.email_normalised = $1`,
      [email],
    )
  ).rows[0] ?? null;

// ------------------------------------------------------------------ tests

try {
  console.log("\nRefused by the server — and the user stays on the form");
  const refused = newCandidate();
  await openForm(refused);
  for (const [label, file, name, mime, expect] of [
    ["script action", FILES.jsAction, "cv.pdf", PDF, /scripts/],
    ["script hidden in a compressed object stream", FILES.jsObjStm, "cv.pdf", PDF, /scripts/],
    ["hex-obfuscated script (/J#61vaScript)", FILES.jsHex, "cv.pdf", PDF, /scripts/],
    ["launch action", FILES.launch, "cv.pdf", PDF, /opens another program/],
    ["encrypted PDF", FILES.encrypted, "cv.pdf", PDF, /encrypted/],
    ["text file named .pdf", FILES.fakePdf, "cv.pdf", PDF, /isn't a readable/],
    ["DOCX with macros", FILES.macroDocx, "cv.docx", DOCX, /macros/],
    ["DOCX with a remote template", FILES.templateDocx, "cv.docx", DOCX, /loads content from the internet/],
    ["DOCX renamed to .pdf", FILES.cleanDocx, "cv.pdf", PDF, /don't match its name/],
  ]) {
    await attach(name, mime, file);
    // Picking a file after an error must not bounce the user to review.
    const stillEditing = (await page.locator('button:has-text("Review referral")').count()) > 0;
    const result = await submit();
    check(result !== "done" && expect.test(result), `${label}: "${result.slice(0, 60)}…"`);
    check(stillEditing, `${label}: user was still on the form when they picked the file`);
  }
  check((await referralFor(refused.email)) === null, "no referral was created for any refused file");

  console.log("\nRefused in the browser, before any upload");
  await attach("huge.pdf", PDF, Buffer.concat([FILES.cleanPdf, Buffer.alloc(4 * 1024 * 1024)]));
  check(/limit is 4 MB/.test((await page.locator("#resume-error").textContent()) ?? ""), "a file over 4 MB");
  await page.setInputFiles("#resume", { name: "cv.doc", mimeType: "application/msword", buffer: Buffer.from("x") });
  check(/\.doc\) files aren't accepted/.test((await page.locator("#resume-error").textContent()) ?? ""), "an old .doc file");

  console.log("\nAccepted — ordinary CVs must not be refused");
  const stored = {};
  for (const [key, file, name, mime] of [
    ["pdf", FILES.cleanPdf, "Priya CV.pdf", PDF],
    ["docx", FILES.cleanDocx, "Priya CV.docx", DOCX],
    ["hyperlink", FILES.hyperlinkDocx, "Priya CV linked.docx", DOCX],
  ]) {
    const c = newCandidate();
    await openForm(c);
    await attach(name, mime, file);
    await page.click('button:has-text("Review referral")');
    const reviewShowsCv = (await page.locator(`dd:has-text("${name}")`).count()) > 0;
    await page.click('button:has-text("Submit referral")');
    await page.waitForSelector('h1:has-text("Referral submitted"), #resume-error', { timeout: 20000 });
    const done = (await page.locator('h1:has-text("Referral submitted")').count()) > 0;
    const confirmed = (await page.locator(`text=CV attached: ${name}`).count()) > 0;
    const row = await referralFor(c.email);
    stored[key] = { ...row, candidate: c };
    check(done, `${key}: accepted${done ? "" : ` — refused: ${await page.locator("#resume-error").textContent()}`}`);
    check(reviewShowsCv, `${key}: the review step lists the CV`);
    check(confirmed, `${key}: the success screen confirms it was attached`);
    check(row?.sha256 === sha(file), `${key}: stored bytes are identical to the upload`);
    check(row?.content_type === mime && row?.size_bytes === file.length, `${key}: type and size recorded from the bytes`);
    check(row?.av_scanned_at === null, `${key}: marked not virus-scanned`);
  }

  const noCv = newCandidate();
  await openForm(noCv);
  check((await submit()) === "done", "a referral with no CV still goes through");
  const noCvRow = await referralFor(noCv.email);
  check(noCvRow && noCvRow.sha256 === null, "and stores no CV row");

  console.log("\nDownloads — admin only, and every one logged");
  const id = stored.pdf.id;
  const url = `${BASE}/admin/resume/${id}`;
  const logCount = async () =>
    (await db.query(`select count(*)::int n from pii_access_log where referral_id = $1`, [id])).rows[0].n;

  const before = await logCount();
  const denied = await plainCtx.request.get(url, { maxRedirects: 0 });
  check(denied.status() === 404, `a non-admin gets 404 (got ${denied.status()})`);
  check((await logCount()) === before, "a refused request writes no audit row");

  const got = await adminCtx.request.get(url, { maxRedirects: 0 });
  const body = await got.body();
  const h = got.headers();
  check(got.status() === 200, `an admin gets 200 (got ${got.status()})`);
  check(sha(body) === sha(FILES.cleanPdf), "the download is byte-for-byte the upload");
  check(/^attachment;/.test(h["content-disposition"] ?? ""), "served as an attachment, never inline");
  check(h["x-content-type-options"] === "nosniff", "nosniff");
  check(/no-store/.test(h["cache-control"] ?? ""), "not cached");
  check(/sandbox/.test(h["content-security-policy"] ?? ""), "sandboxed if a browser does render it");
  check((await logCount()) === before + 1, "the download was logged");

  const entry = (
    await db.query(`select id, actor_email, action from pii_access_log where referral_id = $1 order by id desc limit 1`, [id])
  ).rows[0];
  check(entry.actor_email === ADMIN && entry.action === "resume.download", "the log names who downloaded it");

  check((await adminCtx.request.get(`${BASE}/admin/resume/${noCvRow.id}`)).status() === 404, "404 for a referral with no CV");
  check((await adminCtx.request.get(`${BASE}/admin/resume/not-a-uuid`)).status() === 404, "404 for a malformed id");

  console.log("\nThe audit log cannot be changed");
  const refusesTo = async (sql) => {
    try {
      await db.query("begin");
      await db.query(sql, sql.includes("$1") ? [entry.id] : []);
      await db.query("rollback");
      return false;
    } catch {
      await db.query("rollback").catch(() => {});
      return true;
    }
  };
  check(await refusesTo(`update pii_access_log set actor_email = 'someone@else' where id = $1`), "update is refused");
  check(await refusesTo(`delete from pii_access_log where id = $1`), "delete is refused");
  // Inside a transaction that is rolled back either way, so a missing trigger
  // could not actually empty the log.
  check(await refusesTo(`truncate pii_access_log`), "truncate is refused");

  console.log("\nThe admin inbox offers the CV");
  const inbox = await adminCtx.newPage();
  await inbox.goto(`${BASE}/admin/inbox`, { waitUntil: "networkidle" });
  const card = inbox.locator("li", { hasText: stored.pdf.candidate.name });
  check((await card.locator(`a[href="/admin/resume/${id}"]`).count()) === 1, "a Download CV link on the right card");
  check((await card.locator("text=not been virus-scanned").count()) === 1, "with the not-scanned warning beside it");
  const noCvCard = inbox.locator("li", { hasText: noCv.name });
  check((await noCvCard.locator("text=No CV attached").count()) === 1, "and 'No CV attached' where there is none");
} catch (e) {
  failures++;
  console.log(`  FAIL  unexpected: ${e.message}`);
} finally {
  await browser.close();
  for (const c of candidates) {
    await db.query(`delete from referrals where candidate_id in (select id from candidates where email_normalised = $1)`, [c.email]);
    await db.query(`delete from candidates where email_normalised = $1`, [c.email]);
  }
  await db.query(`delete from employees where id = any($1)`, [Object.values(idOf)]);
  const left = await db.query(`select count(*)::int n from candidates where email_normalised like $1`, [`zz-cv-${RUN}-%`]);
  console.log(`\ncleanup: test referrals, candidates and employees deleted (${left.rows[0].n} left)`);
  await db.end();
}

if (pageErrors.length) {
  failures++;
  console.log(`\nFAIL  browser errors: ${pageErrors.join("; ")}`);
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nPASS — CV upload, storage, download and audit");
process.exit(failures ? 1 : 0);
