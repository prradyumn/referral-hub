// Screenshots every screen, signed in, without touching Google.
// Auth.js sessions are JWTs signed with AUTH_SECRET, so we can mint one.
import { chromium } from "@playwright/test";
import { encode } from "next-auth/jwt";

const BASE = process.env.SHOOT_BASE ?? "http://localhost:3100";
const COOKIE = "authjs.session-token";

const token = await encode({
  token: {
    name: "Pradyumn Awasthi",
    email: "pradyumn@convegenius.ai",
    sub: "preview-user",
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
  secret: process.env.AUTH_SECRET,
  salt: COOKIE,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([
  { name: COOKIE, value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
]);

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));

const shots = [
  ["home", "/home"],
  ["rewards", "/rewards"],
  ["leaderboard", "/leaderboard"],
  ["how-to-refer", "/how-to-refer"],
  ["referrals", "/referrals"],
  ["roles", "/roles"],
  ["refer", "/refer"],
];

for (const [name, path] of shots) {
  const res = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
  // Dismiss the welcome dialog so it doesn't cover every page.
  await page.evaluate(() => {
    try { localStorage.setItem("referral-hub:welcome-seen", "1"); } catch {}
    document.querySelector("dialog[open]")?.close();
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `.screenshots/${name}.png`, fullPage: true });
  console.log(`${String(res?.status()).padEnd(4)} ${path.padEnd(16)} → .screenshots/${name}.png`);
}

// The welcome dialog on a fresh browser
const fresh = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await fresh.addCookies([
  { name: COOKIE, value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
]);
const p2 = await fresh.newPage();
await p2.goto(BASE + "/home", { waitUntil: "networkidle" });
await p2.waitForTimeout(900);
await p2.screenshot({ path: ".screenshots/welcome.png" });
console.log("     welcome dialog  → .screenshots/welcome.png");

// Signed out
const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p3 = await anon.newPage();
await p3.goto(BASE + "/login", { waitUntil: "networkidle" });
await p3.screenshot({ path: ".screenshots/login.png", fullPage: true });
console.log("     login (anon)    → .screenshots/login.png");

await browser.close();
console.log(errors.length ? `\nBROWSER ERRORS:\n  ${errors.join("\n  ")}` : "\nno browser errors");
