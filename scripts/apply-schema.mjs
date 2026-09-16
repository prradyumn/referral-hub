// Applies db/*.sql to DATABASE_URL, in filename order.
//   node --env-file=.env.local scripts/apply-schema.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in .env.local");
  process.exit(1);
}

const host = url.replace(/^postgresql:\/\/[^:]+:[^@]*@/, "postgresql://***:***@");
console.log("target:", host.split("?")[0], "\n");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const files = readdirSync("db").filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  process.stdout.write(`applying db/${f} … `);
  try {
    await client.query(readFileSync(join("db", f), "utf8"));
    console.log("ok");
  } catch (e) {
    console.log("FAILED");
    console.error(`\n  ${e.message}`);
    if (e.position) console.error(`  at character ${e.position}`);
    await client.end();
    process.exit(1);
  }
}

const { rows } = await client.query(
  `select (select count(*) from jobs) as jobs,
          (select count(*) from employees) as employees,
          (select count(*) from referrals) as referrals`,
);
console.log("\nverified:", rows[0]);
await client.end();
