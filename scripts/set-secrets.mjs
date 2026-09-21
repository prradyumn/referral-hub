// Prompts for the values that cannot live in the repo and writes them into
// .env.local. Run from the project root:   npm run env:set
//
// Press Return on a prompt to leave that value unchanged.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { randomBytes } from "node:crypto";

const FILE = ".env.local";

if (!existsSync(FILE)) {
  console.error(`No ${FILE} in this folder. Run this from the project root:`);
  console.error("  cd ~/referral-hub && npm run env:set");
  console.error("\nIf you have not made one yet:  cp .env.example .env.local");
  process.exit(1);
}


// A secret pasted from a chat message, a ticket or a PDF tends to arrive with
// something extra attached. These catch the common cases before Keka answers
// with an error that names none of them.
const looksPasted = (v) =>
  /\s/.test(v)
    ? "that contains a space or newline — secrets do not, so something extra came along"
    : /^https?:\/\//i.test(v)
      ? "that is a URL, not a credential"
      : /^(your|paste|xxx|<|\[)/i.test(v)
        ? "that still looks like a placeholder"
        : null;

const WANTED = [
  {
    key: "DATABASE_URL",
    label: "Neon DATABASE_URL",
    hint: "Vercel -> Storage -> the Neon store -> Getting Started -> .env.local tab -> Copy Snippet.\n  Paste the pooled DATABASE_URL value (not DATABASE_URL_UNPOOLED).",
    check: (v) =>
      !/^postgres(ql)?:\/\//.test(v)
        ? "that does not look like a connection string — it should start with postgresql://"
        : /\[|\]|YOUR-PASSWORD/i.test(v)
          ? "that still contains a placeholder"
          : null,
  },
  {
    key: "AUTH_GOOGLE_SECRET",
    label: "Google client secret",
    hint: "Google Cloud -> Credentials -> your OAuth client -> the secret you copied at creation.",
    check: (v) =>
      !v.startsWith("GOCSPX-")
        ? "a Google client secret normally starts with GOCSPX- — check you copied the whole thing"
        : v.length !== 35
          ? `that is ${v.length} characters; a Google client secret is normally 35`
          : null,
  },
  {
    key: "KEKA_COMPANY",
    optional: true,
    label: "Keka subdomain",
    hint: "Just the first label of <company>.keka.com — no protocol, no dots, no slashes.",
    check: (v) =>
      /^https?:\/\//i.test(v)
        ? "paste only the subdomain, not the whole URL"
        : v.includes(".")
          ? `that contains a dot — if your Keka URL is acme.keka.com, the value is just "acme"`
          : /[^a-z0-9-]/i.test(v)
            ? "a subdomain is letters, digits and hyphens only"
            : null,
  },
  {
    key: "KEKA_CLIENT_ID",
    optional: true,
    label: "Keka client ID",
    hint: "Keka -> Global admin settings -> Integrations & Automations -> API access -> API key.",
    check: looksPasted,
  },
  {
    key: "KEKA_CLIENT_SECRET",
    optional: true,
    label: "Keka client secret",
    hint: "Issued alongside the client ID. Keka shows it once — if it is lost, issue a new key.",
    check: (v) => looksPasted(v) ?? (v.length < 16
      ? `that is only ${v.length} characters, which is short for a client secret — check it is complete`
      : null),
  },
  {
    key: "KEKA_API_KEY",
    optional: true,
    label: "Keka API key",
    hint: "The third value on the same screen. Distinct from the client secret — all three are required.",
    check: (v) => looksPasted(v) ?? (v.length < 16
      ? `that is only ${v.length} characters, which is short for an API key — check it is complete`
      : null),
  },
  {
    key: "CRON_SECRET",
    optional: true,
    label: "Cron secret for /api/cron/keka",
    hint: "Any long random string. Press Return on an empty value to generate one.",
    generate: () => randomBytes(32).toString("base64url"),
    check: (v) =>
      v.length < 24
        ? `that is ${v.length} characters; use at least 24, or leave it blank to have one generated`
        : null,
  },
];

let text = readFileSync(FILE, "utf8");
const rl = createInterface({ input: stdin });
const lines = rl[Symbol.asyncIterator]();
const ask = async (prompt) => {
  stdout.write(prompt);
  const { value, done } = await lines.next();
  if (done) {
    stdout.write("\n");
    return "";
  }
  return String(value);
};
let changed = 0;

for (const { key, label, hint, check, generate } of WANTED) {
  const current = (text.match(new RegExp(`^${key}=(.*)$`, "m")) || [, ""])[1].trim();
  console.log(`\n${label}  [${key}]`);
  console.log(`  ${hint}`);
  if (current) console.log(`  currently set (${current.length} characters) — Return keeps it`);

// Strip surrounding quotes and any trailing sentence punctuation. A secret
    // copied out of prose ("the key is GOCSPX-abc.") picks up the full stop, and
    // Google then answers invalid_client with no hint about why.
    const answer = (await ask("  paste here: "))
      .trim()
      .replace(/^['"]|['"]$/g, "")
      .replace(/[.,;:)]+$/, "");
  let value = answer;
  if (!value && !current && generate) {
    value = generate();
    console.log(`  generated a ${value.length}-character value`);
  }
  if (!value) {
    console.log(current ? "  kept" : "  skipped — still empty");
    continue;
  }
  const answerFinal = value;
  const problem = check(answerFinal);
  if (problem) console.log(`  warning: ${problem}`);

  const line = `${key}=${answerFinal}`;
  // A function replacement, so a "$" inside a password is never treated as a
  // replacement pattern by String.replace.
  text = new RegExp(`^${key}=.*$`, "m").test(text)
    ? text.replace(new RegExp(`^${key}=.*$`, "m"), () => line)
    : `${text.replace(/\n*$/, "\n")}${line}\n`;
  changed++;
  console.log("  set");
}

rl.close();

if (changed) {
  writeFileSync(FILE, text, { mode: 0o600 });
  console.log(`\nWrote ${changed} value${changed > 1 ? "s" : ""} to ${FILE}.`);
} else {
  console.log(`\nNothing changed.`);
}

const isSet = (k) => Boolean((text.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]);

// The app cannot start without these.
const missingRequired = WANTED.filter((w) => !w.optional && !isSet(w.key)).map((w) => w.key);
// Keka is an integration, not a prerequisite. Sign-in, roles and referrals all
// work without it, so an empty Keka block is a note rather than a failure.
const missingOptional = WANTED.filter((w) => w.optional && !isSet(w.key)).map((w) => w.key);

if (missingOptional.length) {
  console.log(`\nNot set (optional): ${missingOptional.join(", ")}`);
  console.log("  The app runs without these — you just get no Keka sync.");
}

if (missingRequired.length) {
  console.log(`\nStill empty and required: ${missingRequired.join(", ")}`);
  process.exit(1);
}

console.log("\nNext:  npm run db:apply");
if (!missingOptional.includes("KEKA_CLIENT_ID")) {
  console.log("       npm run keka:verify     # checks the credential and its scopes");
  console.log("       npm run keka:discover   # read-only tenant reconnaissance");
}
console.log("       npm run dev");
