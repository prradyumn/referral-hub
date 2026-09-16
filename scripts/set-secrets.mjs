// Prompts for the values that cannot live in the repo and writes them into
// .env.local. Run from the project root:   npm run env:set
//
// Press Return on a prompt to leave that value unchanged.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const FILE = ".env.local";

if (!existsSync(FILE)) {
  console.error(`No ${FILE} in this folder. Run this from the project root:`);
  console.error("  cd ~/Downloads/referral-hub && npm run env:set");
  process.exit(1);
}

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

for (const { key, label, hint, check } of WANTED) {
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
  if (!answer) {
    console.log(current ? "  kept" : "  skipped — still empty");
    continue;
  }
  const problem = check(answer);
  if (problem) console.log(`  warning: ${problem}`);

  const line = `${key}=${answer}`;
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

const missing = WANTED.map((w) => w.key).filter(
  (k) => !(text.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1],
);
if (missing.length) {
  console.log(`Still empty: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("\nNext:  npm run db:apply    then    npm run dev");
