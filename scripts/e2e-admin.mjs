/**
 * Proves the admin screens are actually closed to ordinary employees.
 *
 *   node --env-file=.env.local scripts/e2e-admin.mjs     (dev server running)
 *
 * CONTEXT.md convention 6: *"What a role cannot approve, it must also be
 * unable to read … every authorisation rule needs a test that calls the
 * server action or query directly, not a UI test."*
 *
 * Since the Auth.js migration there is no RLS. requireAdmin() in
 * src/lib/admin.ts is the only thing standing between an employee and the
 * reward configuration, so run this whenever anything under /admin changes.
 *
 * Creates two temporary employees and deletes them again.
 */

import { chromium } from "@playwright/test";
import { encode } from "next-auth/jwt";
import pg from "pg";

const BASE = process.env.SHOOT_BASE ?? "http://localhost:3000";
const COOKIE = "authjs.session-token";
const ADMIN = `e2e_admin_${Date.now()}@convegenius.ai`;
const PLAIN = `e2e_plain_${Date.now()}@convegenius.ai`;
const ADMIN_ROUTES = ["/admin/rewards", "/admin/sync", "/admin/pipeline", "/admin/settings"];

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

await db.query(
  `insert into employees (email, full_name, is_admin) values ($1,$2,true), ($3,$4,false)
   on conflict (email) do update set is_admin = excluded.is_admin`,
  [ADMIN, "E2E Admin", PLAIN, "E2E Plain"],
);

try {
  // ---- the database predicate, called directly -------------------------
  console.log("\nis_admin_email() — the rule itself");
  const q = async (email) =>
    (await db.query(`select is_admin_email($1) as ok`, [email])).rows[0].ok;

  check((await q(ADMIN)) === true, "an employee with is_admin = true is an admin");
  check((await q(PLAIN)) === false, "an ordinary employee is not");
  check((await q("nobody@convegenius.ai")) === false, "an unknown address is not");
  check((await q(ADMIN.toUpperCase())) === true, "the check is case-insensitive");
  check((await q("")) === false, "an empty address is not");

  // The bootstrap list must work even with is_admin false everywhere.
  await db.query(
    `insert into app_settings (key, value) values ('admin_emails', $1)
     on conflict (key) do update set value = excluded.value`,
    [PLAIN],
  );
  check((await q(PLAIN)) === true, "app_settings.admin_emails grants access");
  await db.query(`update app_settings set value = '' where key = 'admin_emails'`);
  check((await q(PLAIN)) === false, "…and removing it takes access away again");

  // ---- the routes ------------------------------------------------------
  console.log("\nadmin routes over HTTP");
  const browser = await chromium.launch();

  const asUser = async (email) => {
    const token = await encode({
      token: { name: email, email, sub: `e2e-${email}`, exp: Math.floor(Date.now() / 1000) + 600 },
      secret: process.env.AUTH_SECRET,
      salt: COOKIE,
    });
    const ctx = await browser.newContext();
    await ctx.addCookies([
      { name: COOKIE, value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
    ]);
    return ctx;
  };

  const adminCtx = await asUser(ADMIN);
  const plainCtx = await asUser(PLAIN);

  for (const route of ADMIN_ROUTES) {
    const a = await (await adminCtx.newPage()).goto(BASE + route);
    check(a.status() === 200, `admin reaches ${route} (${a.status()})`);

    const p = await (await plainCtx.newPage()).goto(BASE + route);
    check(p.status() === 404, `ordinary employee is refused ${route} (${p.status()})`);
  }

  // The nav must not advertise a door that will not open.
  const plainHome = await plainCtx.newPage();
  await plainHome.goto(BASE + "/roles");
  const linkCount = await plainHome.locator('a[href^="/admin"]').count();
  check(linkCount === 0, "no admin link is rendered for an ordinary employee");

  const adminHome = await adminCtx.newPage();
  await adminHome.goto(BASE + "/roles");
  check(
    (await adminHome.locator('a[href^="/admin"]').count()) > 0,
    "the admin link is rendered for an admin",
  );

  await browser.close();
} finally {
  await db.query(`delete from employees where email in ($1,$2)`, [ADMIN, PLAIN]);
  await db.query(`update app_settings set value = '' where key = 'admin_emails'`);
  console.log("\ncleanup done");
  await db.end();
}

console.log(
  failures
    ? `\nFAIL — ${failures} check(s) failed\n`
    : "\nPASS — the admin screens are closed to ordinary employees\n",
);
process.exit(failures ? 1 : 0);
