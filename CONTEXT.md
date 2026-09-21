# ConveGenius Referral Hub — Project Context

**Read this first.** It is the single source of truth for anyone — human or AI — picking
up this project. It covers what exists, what is live, why things are built the way they
are, what is decided, what is not, and what every remaining phase contains.

| | |
| --- | --- |
| Last updated | 21 September 2026 |
| Phase | **0 complete. Phase 1 jobs sync is LIVE** — 906 Keka jobs synced, 56 open roles browsable, referral flow re-verified against them on 21 Sep 2026. Candidate push still blocked, see §16 |
| Auth | **Auth.js (NextAuth v5) + Google, JWT sessions.** Supabase Auth was removed on 16 Sep 2026 |
| Local path | `/Users/pradyumnawasthi/referral-hub` (was `~/Downloads/referral-hub`) |
| Owner | Pradyumn Awasthi (pradyumn@convegenius.ai) |
| Companion docs | Build spec and decision log — see §14 |

---

## 1. What this product is

An internal Employee Referral Hub for ConveGenius. An employee signs in, browses open
roles, refers someone they know, and can see exactly where that candidate has reached
and what reward is owed — without chasing a recruiter.

It began as a clickable prototype at `employee-referal-dashboard.lovable.app`. That
prototype is a **specification written in code**, not a codebase: a single 165 KB HTML
file, no backend, no persistence. Read it for the copy, the state model and the
information architecture. Do not port its JavaScript.

### The problem it solves

Referral programmes fail in the gap between "I referred someone" and "what happened to
them". The Hub closes that gap with three commitments:

1. **The employee always knows where their candidate is** — in words they understand.
2. **The employee never sees what they should not** — interview feedback, scores, salary
   and rejection reasoning stay in the ATS.
3. **A promise made is a promise kept** — if the system says a reward is owed, it is
   owed, and something surfaces when it does not arrive.

---

## 2. Scale — read this before designing anything

From the prototype's own analytics, which reflect the real programme:

| Measure | Value |
| --- | --- |
| Employees eligible to refer | 1,240 |
| Referrals per financial year | 412 |
| Referral hires per year | 58 |
| Employees who actually referred | 186 |
| Open roles at any time | ~32 |
| Referrals in a peak month | ~35 |

**One referral every five working hours.** This is the most important architectural fact
in the project.

It needs one Postgres database, one web app and one background worker. It does **not**
need microservices, a message broker, a cache tier, sharding, or an event-sourced ledger.
Over-engineering is the most likely way to make this late.

Five-year storage projection: ~2,100 referrals, ~420 MB of résumés, well under 1 GB
relational including audit history. One Supabase project covers the product's life.

The hard problems are **correctness and auditability**, not throughput: duplicate
detection, eligibility timing, payroll reconciliation, and permissions. None of those get
easier with more infrastructure.

---

## 3. Current state — what actually exists

### Working end to end

- Sign-in by **Google** in a **popup**, work accounts only, through Auth.js. The `hd` hint
  narrows the Google account chooser, the `signIn` callback rejects any other domain, and a
  database trigger rejects it a third time. The popup means the app is never navigated away
  from; if it is blocked the button falls back to the full-page redirect
- Employee record created or matched on first sign-in by `currentEmployee()`, upserting on
  email
- Ten seeded open roles, browsable with search and filters
- Two-step referral submission with real validation and candidate consent capture
- Duplicate detection at submit, which never reveals who referred first
- "My referrals" list, scoped to the signed-in employee in the query itself, with the
  dated candidate journey
- **Home, My rewards, Leaderboard and How to refer** — the screens from the HR
  requirements sheet, rendered from `src/lib/showcase.ts`. Every figure on them is
  invented and marked "Sample data"; see §3 *Not built yet*
- A first-visit **welcome dialog** showing the milestone gift tiers

### Verified, not assumed

Supabase Auth was removed on 16 September 2026 by migrations `0002` and `0003`. The app
holds no Supabase API key at all; it talks to Postgres directly over the pooler with a
password that never reaches the browser. The published `anon` and `authenticated` roles
were stripped of every privilege in `public`, and that was proved with a live PostgREST
call using the publishable key:

| Probe (publishable key, PostgREST) | Result |
| --- | --- |
| Read `jobs`, `employees`, `referrals`, `candidates` | `401` `42501` on every one |
| Call `submit_referral` | `401` — "permission denied for function submit_referral" |

RLS was verified the same way before the migration. It is now gone by design — see §6.

Also verified: 6 tables, 10/10 roles seeded, and the normalisers behaving
(`09876543210` → `+919876543210`; `  Priya.Sharma+jobs@Example.COM ` →
`priya.sharma@example.com`).

**The referral flow was run end to end on 17 September 2026** — until then it never had
been, and `submit_referral` had not executed once since `0002` rewrote it. Two scripts do
this, both of which delete the rows they create:

| Script | Proves |
| --- | --- |
| `scripts/e2e-refer.mjs` | A referral submitted through the real form writes `REF-` plus 8 hex, snapshots reward and eligibility days, stores the phone as E.164 and the consent text, appends one `referral_stages` row, and sets six-month validity. Re-submitting the same candidate is refused with a message that does not name the earlier referrer |
| `scripts/e2e-scoping.mjs` | Two employees with one referral each: neither sees the other's candidate name or ref code |

The second matters more than it looks. Row-level security used to guarantee that scoping;
since `0002` the only thing standing between one employee and another's candidates is
`where r.referrer_id = $1` in `src/app/(app)/referrals/page.tsx`. Nothing else will catch
that clause being dropped, so **run this script whenever that file changes**.

Three real sign-ins have created `employees` rows, all `@convegenius.ai`, names populated
from Google — so the domain rule is holding in practice, not just in theory.

### Not built yet

No résumé upload (the field is absent, not broken). No admin portal.

**The ATS and HRMS system is Keka**, confirmed 21 September 2026 — Keka Hire, Keka HRIS
and Keka Payroll are all licensed. The jobs sync and the candidate push are **written but
have never been run against the tenant**; roles are still seeded and referral status still
stays at `submitted`. §16 covers what is built, what is unverified, and the two facts
about the tenant that no amount of reading the documentation will supply.

**Rewards, gifts, milestones and the leaderboard have screens but no features.** They read
from `src/lib/showcase.ts` and every one carries a visible "Sample data" marker, with the
phase it belongs to stated on the page. This is deliberate: the layouts are being agreed
with HR before the engines behind them are built. It is also the one thing most likely to
be misread by someone new — the numbers are invented, and §7 convention 1 is why they are
labelled rather than quietly plausible. When you wire a screen to live data, delete its
entry from that file rather than leaving a silent fallback.

---

## 4. Live environment

Nothing here is secret except where noted. Secrets live in `.env.local` (gitignored) and
in Vercel's environment variables.

### Database — Neon

Supabase was dropped entirely on 16 September 2026. Auth went first (to Auth.js), and the
database followed, because a Vercel-managed Neon store injects `DATABASE_URL` into the
project automatically — no password to copy between dashboards, and no free-plan pause.

| | |
| --- | --- |
| Provider | Neon, attached through the Vercel marketplace integration |
| Store | `neon-aquamarine-chair` · Neon ID `lively-grass-21104118` |
| Plan | Free — 0.5 GB storage, 100 compute-hours/month. Sleeps when idle, wakes on connect; nothing is deleted |
| Region | **Washington DC, `iad1`** — see the note below |
| Connection | Always the **pooled** `DATABASE_URL`, never `DATABASE_URL_UNPOOLED` |
| Injected into | Vercel Preview and Production automatically, as integration-managed secrets |
| Local | Copy the `.env.local` snippet from Vercel → Storage → the store → Getting Started |

The integration also injects `POSTGRES_URL`, `PGHOST`, `PGPASSWORD` and a dozen more
aliases. The app reads **only** `DATABASE_URL`; ignore the rest.

**The region is worth revisiting.** Every user is in India and the database is in
Virginia, which adds roughly 250 ms round trip per query — noticeable on a page that runs
three. Neon has a Singapore region. Moving means recreating the store and re-running
`npm run db:apply`, which is ten minutes, so do it before there is real data rather than
after.

**Supabase project `qnskrjxzeuuysbviqxhd` still exists** and still holds the old schema.
Nothing points at it. Delete it once the Neon cutover has been used for a week.

### Google Cloud

| | |
| --- | --- |
| Project | `Referral Hub` / `referral-hub-508812` |
| Organisation | convegenius.ai |
| Consent screen | **Internal** — only convegenius.ai accounts, no Google verification needed |
| App name shown to users | ConveGenius Referral Hub |
| Support + contact email | pradyumn@convegenius.ai |
| OAuth client | `Referral Hub (Supabase)`, type Web application — the name is now historical, rename it |
| Name employees actually see | **"CG HR Portal"** on the Google consent screen. Not the "ConveGenius Referral Hub" recorded here before — worth making deliberate, it is what people read when deciding whether to trust the sign-in |
| Client ID | `515322592770-1111n28bcp5d0h3c6k13d91ffhm6ihn9.apps.googleusercontent.com` |
| Redirect URI — local | `http://localhost:3000/api/auth/callback/google` |
| Redirect URI — production | `https://referral-hub-prradyumns-projects.vercel.app/api/auth/callback/google` |
| Redirect URI — dead | `https://qnskrjxzeuuysbviqxhd.supabase.co/auth/v1/callback` — remove it |
| Scopes | `email profile` only |

**Internal was only available because the project sits inside the convegenius.ai
organisation.** Outside it, you would be stuck on External: a 100-person test-user list
and a "Google hasn't verified this app" warning. If you ever recreate the project, check
the Organisation field on the create form.

**Housekeeping owed:** two client secrets currently exist. Delete the older one
(`****g80a`) now that the newer works — Google allows only two, so the dead one blocks
future rotation.

### Environment variables

```
DATABASE_URL=postgresql://postgres.qnskrjxzeuuysbviqxhd:PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
AUTH_SECRET=…                    # openssl rand -base64 32
AUTH_GOOGLE_ID=515322592770-….apps.googleusercontent.com
AUTH_GOOGLE_SECRET=…
ALLOWED_EMAIL_DOMAIN=convegenius.ai
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN=convegenius.ai
# AUTH_URL=https://…             # set in production if the public origin differs
```

The first four are **secrets** — never `NEXT_PUBLIC_`, never committed.
`NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN` is the only one the browser sees, and it exists purely
to show a friendly error before the round trip. `ALLOWED_EMAIL_DOMAIN` must match the
`allowed_email_domain` row in `app_settings`; the database enforces it regardless.

`.env.local.bak-supabase` holds the pre-migration file. `.gitignore` now covers `.env*`,
which it did not before — the old patterns `.env.local` and `.env*.local` both missed that
backup.

### Vercel

| | |
| --- | --- |
| Project | `referral-hub` · `prj_49WsgTQyLmNoGXGUM3x6zvfrJkcd` |
| Team | `prradyumns-projects` · `team_9BT0BbrkpDS9X5pv1EsmzpHd` (Hobby) |
| Production URL | `https://referral-hub-prradyumns-projects.vercel.app` |
| Deployment Protection | **Off** — disabled 16 Sep 2026, see §8 for how |
| Env vars set | `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL_DOMAIN`, plus the `DATABASE_URL` / `POSTGRES_*` / `PGHOST*` set Neon injected |
| Removed | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Deleted 17 Sep | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN` — nothing read them |

**Production works.** Sign-in, roles, refer and My referrals all run against Neon.

The code reads four variables for the app itself — `DATABASE_URL`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL_DOMAIN` — plus `AUTH_SECRET` and `AUTH_URL`, which
Auth.js reads itself, and since 21 Sep the Keka set: `KEKA_COMPANY`, `KEKA_CLIENT_ID`,
`KEKA_CLIENT_SECRET`, `KEKA_API_KEY`, `KEKA_ENV` and `CRON_SECRET` (§16). `grep -rhoE 'process\.env\.[A-Z_0-9]+' src/` is the whole list;
everything else in the dashboard is either Neon's or dead.

`AUTH_URL` is set to the production URL on purpose. Vercel serves the same deployment on
several hostnames and OAuth needs an exact redirect-URI match — see §8.

---

## 5. Stack and repo layout

Next.js 16 (App Router) · React 19 · TypeScript 5.9 · Tailwind CSS 4 · **Auth.js v5**
(NextAuth beta — JWT sessions, no database adapter) · **node-postgres** straight to
Postgres on Neon · Zod. Chosen to match ConveGenius's existing Node/TypeScript skills.

```
referral-hub/
├── CONTEXT.md                        ← this file
├── README.md                         ← how to set up and run
├── .env.local                        ← secrets, gitignored
├── .env.local.bak-supabase           ← pre-migration copy, also gitignored
├── .env.example
├── vercel.json                       ← the two Keka cron schedules (§16)
├── db/
│   ├── 0001_schema.sql               ← the whole schema, plain PostgreSQL 14+
│   ├── 0002_seed.sql                 ← ten open roles
│   └── 0003_keka.sql                 ← Keka ids, stage map, sync runs (§16)
├── scripts/
│   ├── apply-schema.mjs              ← npm run db:apply — applies db/*.sql in order
│   ├── e2e-refer.mjs                 ← submits a referral, checks the rows, cleans up
│   ├── e2e-scoping.mjs               ← proves My referrals is scoped (run on any change
│   │                                   to referrals/page.tsx)
│   ├── keka-discover.mjs             ← read-only tenant reconnaissance (§16)
│   ├── keka-mapping-check.mjs        ← 37 assertions on the Keka ↔ Hub mapping
│   └── shoot.mjs                     ← screenshots every screen, signed in, no Google
├── eslint.config.mjs                 ← flat config; `next lint` no longer exists
└── src/
    ├── auth.ts                       ← Auth.js config: Google, hd hint, domain callback
    ├── proxy.ts                      ← route gating (Next 16's name for middleware.ts)
    ├── middleware.ts                 ← DOES NOT EXIST; Next 16 renamed it to proxy.ts
    ├── components/
    │   ├── GoogleSignInButton.tsx    ← opens the sign-in popup, falls back to redirect
    │   ├── WelcomeDialog.tsx         ← first-visit gift tiers
    │   ├── Chrome.tsx                ← PageHead, PreviewTag, StatGroup, ShowcaseNotice
    │   └── Logo.tsx                  ← the mark, inlined (next/image rejects SVG)
    ├── lib/
    │   ├── keka/
    │   │   ├── client.ts             ← token, rate limit, paging, retry. Node only
    │   │   ├── map.ts                ← pure Keka ↔ Hub mapping, imports nothing
    │   │   ├── jobs.ts               ← jobs pull and reconcile
    │   │   ├── candidates.ts         ← candidate push and the retry sweeper
    │   │   └── sync.ts               ← run recording, watermarks, health
    │   ├── db.ts                     ← lazy pg.Pool on the pooler, Node runtime only
    │   ├── employees.ts              ← signedInUser() (no DB) and currentEmployee() (DB)
    │   ├── showcase.ts               ← invented data for the unbuilt screens
    │   ├── validation.ts             ← Zod schema, CONSENT_NOTICE, phone formatting
    │   └── format.ts                 ← rupees(), shortDate(), initials()
    └── app/
        ├── layout.tsx  globals.css  page.tsx
        ├── icon.svg                  ← favicon (Next serves app/icon.svg automatically)
        ├── login/page.tsx            ← Google button, domain hint, error display
        ├── api/auth/[...nextauth]/route.ts   ← Auth.js handlers
        ├── api/cron/keka/route.ts     ← the scheduled Keka sync (§16)
        ├── auth/popup/page.tsx       ← starts OAuth inside the popup
        ├── auth/complete/page.tsx    ← messages the opener, closes itself
        └── (app)/
            ├── layout.tsx            ← signed-in shell, session only — no database
            ├── home/page.tsx         ← dashboard: referrals, cash, gifts   (showcase)
            ├── rewards/page.tsx      ← reward and milestone tracking       (showcase)
            ├── leaderboard/page.tsx  ← top 3, period filters               (showcase)
            ├── how-to-refer/page.tsx ← steps, video slot, policy, flyer    (showcase)
            ├── roles/page.tsx        ← server component, GET-form filters
            ├── refer/page.tsx        ← loads jobs, renders the form
            ├── refer/ReferralForm.tsx← two-step client form
            ├── refer/actions.ts      ← server action → submit_referral
            └── referrals/page.tsx    ← own referrals only + journey
```

### Commands

```bash
npm install
npm run dev         # http://localhost:3000
npm run build
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .  — NOT `next lint`, removed in Next 16
```

With the dev server running:

```bash
node --env-file=.env.local scripts/e2e-refer.mjs     # writes and deletes rows
node --env-file=.env.local scripts/e2e-scoping.mjs   # writes and deletes rows
node --env-file=.env.local scripts/shoot.mjs         # screenshots into .screenshots/

npm run keka:check                                   # mapping tests, no credentials
npm run keka:discover                                # read-only Keka reconnaissance
```

Both e2e scripts write to whatever `DATABASE_URL` points at. Do not run them against
production once there is real data in there.

---

## 6. Database

Six tables. Everything money-related is effective-dated so a policy revision never
rewrites history.

| Table | Holds | Notes |
| --- | --- | --- |
| `app_settings` | key/value programme config | `allowed_email_domain`, `referral_validity_months` |
| `employees` | id (`gen_random_uuid()`), email, name, department, location | Created on first sign-in by `currentEmployee()`. Phase 1 replaces with HRMS sync |
| `jobs` | req id, title, dept, location, experience, priority, reward, eligibility days, summary, skills | Phase 1 replaces with ATS sync |
| `candidates` | name, normalised email, E.164 phone, org, designation, LinkedIn | **The PII boundary.** Retention rules apply here first |
| `referrals` | referrer, candidate, job, relationship, status, timestamps, validity, **reward + eligibility snapshot**, **consent text + timestamp** | One row per submission |
| `referral_stages` | append-only stage history | Already shaped for the ATS sync |

### Functions

| Function | Purpose |
| --- | --- |
| `setting(key)` | Reads `app_settings`. Config, never constants in code |
| `enforce_employee_domain()` | Trigger on `employees`. Rejects any email outside `allowed_email_domain` |
| `normalise_email(text)` | Lowercase, trim, strip plus-addressing |
| `normalise_phone(text)` | Indian mobile → E.164 |
| `submit_referral(…)` | **The only way a referral can be created** |

### Access control — there is no RLS any more

RLS was the enforcement layer while Supabase Auth issued the JWTs. Auth.js puts no
`auth.uid()` into the database session, so RLS has nothing left to key on. Migration
`0002` dropped all six policies and disabled RLS on all six tables; `0002` and `0003`
together revoked every privilege on tables, sequences and functions — and `USAGE` on the
`public` schema — from `anon` and `authenticated`.

**The enforcement layer is now the application server.** The `DATABASE_URL` role is the
only identity that can read or write, it never reaches the browser, and every query lives
in server-only code that filters by the signed-in employee's id. Four rules keep that
honest:

- `src/lib/db.ts` is Node-runtime only and must never be imported by a client component
- Every `referrals` and `candidates` query carries an explicit `referrer_id = $n`. There
  is no safety net underneath it any more
- Writes still go exclusively through `submit_referral`
- Before any multi-role feature — admin, recruiter, manager — decide deliberately whether
  to reintroduce RLS keyed on a session variable (`set local app.employee_id`) or to keep
  all authorisation in the server layer. Do not drift into a half-and-half state

### `submit_referral` contract

Signature: `(p_referrer_id uuid, p_job_id uuid, p_full_name, p_email, p_phone, p_org,
p_designation, p_linkedin, p_relationship, p_consent_text)` → `(ref_code, reward_amount)`.

It is **no longer `SECURITY DEFINER`**. It runs as the caller — the application role — and
takes the referrer's id as an argument instead of reading `auth.uid()`. Passing the wrong
id is therefore an application bug that the database will not catch: `actions.ts` must
always pass `employee.id` from `requireEmployee()`, never anything from the request body.

In order, it:

1. Rejects an unknown referrer, and a closed or unknown job
2. Rejects a missing consent notice
3. Normalises email and phone
4. Takes `pg_advisory_xact_lock` on the normalised email and phone, so two concurrent
   submissions of the same candidate serialise instead of racing the duplicate check
5. **Duplicate check** — any referral of the same normalised email *or* phone inside the
   validity window, by anyone, raises `unique_violation` with a message that never names
   the earlier referrer
6. Creates the candidate, mints a `REF-` + 8 hex code, snapshots the reward amount and
   eligibility days, stores the consent text
7. Appends the first `referral_stages` row

EXECUTE is revoked from `public`, `anon` and `authenticated` by migration `0003`, and
default privileges for new functions in `public` no longer grant EXECUTE to `public`.

`actions.ts` keeps a `SPEAKABLE` set of SQLSTATEs — `23505`, `42501`, `P0002`, `23514` —
whose messages are safe to show the user. Everything else surfaces as a generic error.

---

## 7. Conventions — the rules future work must follow

These are not style preferences. Each one exists because the prototype got it wrong.

**1. State, audit and notification commit together.** Every change an employee can see
lands in one database transaction: the state row, the audit row and the outbox row. A
worker drains the outbox and delivers, retrying and dead-lettering. Nothing tells an
employee something happened before the state actually changed. *The prototype wrote an
audit row for a gift action that never changed the record, and toasted "the employee has
been notified" when nothing moved. That class of bug is what this convention eliminates.*

**2. Configuration lives in data.** Milestone thresholds, gift values, reward rates,
status wording, cooling periods, SLAs. Adding an FY28 milestone is data entry, not a
release.

**3. A referral snapshots the rate that applied when it was submitted.** Rates change; a
promise made to an employee does not.

**4. The Hub is never the source of truth** for employee identity, job data or
recruitment stage. It owns referrals, rewards, gifts and programme configuration. Nothing
else.

**5. The duplicate message never names the earlier referrer.** Ever.

**6. Permissions are enforced below the UI, and tested.** What a role cannot approve, it
must also be unable to read. Since the Auth.js migration that enforcement sits in the
server layer rather than in RLS (§6), which makes it *easier* to get wrong, not harder —
so every authorisation rule needs a test that calls the server action or query directly,
not a UI test.

**7. Filtering is navigation.** Search and filters are GET forms, so every filtered view
has a URL and typing never re-renders mid-keystroke. *The prototype's search box accepted
exactly one character before the re-render dropped focus to `<body>`.*

**8. Validation is structural.** One Zod schema per endpoint, validated on the way in and
reused as the client type. The same schema runs client-side for instant feedback.

**9. Pull before push on integrations.** A scheduled pull with a watermark is boring and
it works. Webhooks are an accelerator added later, never the mechanism.

**10. Silence must mean healthy.** Every sync run is recorded; a sync that has not
succeeded in 24 hours raises an alert.

---

## 8. Gotchas already paid for

Do not rediscover these.

**A secret copied out of prose brings the full stop with it.** `GOCSPX-…tavv.` is 36
characters; a Google client secret is 35. Google answers `invalid_client: The provided
client secret is invalid`, which reads like a wrong or revoked key and sends you back to
the console to regenerate one. It cost an hour. `npm run env:set` now strips trailing
punctuation and warns on the wrong length — use it rather than editing `.env.local` by
hand.

**Check the dev server log before theorising.** `.next/dev/logs/next-development.log`
carries the `[auth][details]` line with Google's actual error. `client_secret is missing`
and `The provided client secret is invalid` are different faults; the browser shows the
same "Sign-in is not configured correctly" for both.

**`next dev` will not start twice in one folder.** It reports the running PID and exits, so
a pasted `npm run dev` after an earlier one looks like it worked and silently leaves the
old process serving stale config. `kill <pid>` first.

**TextEdit is not a reliable way to edit `.env.local`.** A paste that is never saved leaves
the file untouched and the failure looks identical to a wrong value. Check the file's
modification time before believing an edit landed.

**Postgres grants EXECUTE on every new function to the pseudo-role `PUBLIC`.** Tables have
no such default — which is why revoking table privileges from `anon` and `authenticated`
worked while the identical statement on functions did nothing. Those roles inherit from
`PUBLIC`, and revoking from them never touches `PUBLIC`. Revoke from `public` explicitly,
and add `alter default privileges in schema public revoke execute on functions from
public`.

**`create or replace function` re-grants EXECUTE to `PUBLIC`.** Migration `0002` revoked
in step 1 and then recreated `submit_referral` in step 5, silently reopening the hole it
had just closed. Revoke *after* the last `create`, never before. Migration `0003` exists
for no other reason.

**A Supabase publishable key still reaches PostgREST after you stop using Supabase Auth.**
Deleting the key from your app removes nothing at all. Verify the lockdown with a real
HTTP call using that key, not by reading the application code.

**Vercel's Deployment Protection toggle can silently fail to save.** Two UI attempts
reverted with no error and no toast. `PATCH /api/v9/projects/<projectId>?teamId=<teamId>`
with body `{"ssoProtection": null}`, from the dashboard tab so the session cookie rides
along, worked first time. Verify with a `GET` of the same endpoint rather than by looking
at the switch.

**The device shell is Linux; the Mac is macOS arm64.** Never run `npm install` through a
mounted-folder Linux shell — Next's SWC and Tailwind's oxide binaries install for the
wrong platform and the build fails confusingly. Install and run natively on the Mac.
`npx tsc --noEmit` is safe either way, because TypeScript is pure JavaScript.

**Next 16 renamed `middleware.ts` to `proxy.ts`.** The export is `proxy`, not
`middleware`. Removing it logs people out mid-task.

**Tailwind v4 cannot `@apply` your own component class.** `.btn-primary { @apply btn … }`
fails with "Cannot apply unknown utility class". Spell the utilities out in each class.

**Magic-link sign-in is gone.** Auth.js is configured with Google only, so nothing is
emailed at sign-in and Supabase's SMTP cap no longer affects auth. Real SMTP is still
needed for Phase 1 notifications.

**The Supabase free plan pauses a project after a week of inactivity** and keeps no
backups. See §11.

**Copy Google's client secret with the copy button, never by selecting the text.** A drag
selection grabs a visible fragment; we lost an hour to a 12-character partial that
produced `unable to exchange external code`. Google never shows a secret twice — if it is
lost, add a new one rather than recreating the client.

**The Supabase "Client IDs" field ships with real text in it, not a placeholder.** Select
all before typing or you get `referral-hub515322592770-…` and an `invalid_client`.

**Saving the Google provider in Supabase requires the secret.** Without it the Save
silently does nothing and the toggle reverts — which reads as `provider is not enabled`.

**Google says config changes can take five minutes to a few hours to propagate.** On a
first-attempt `redirect_uri_mismatch` or `invalid_client`, wait before changing anything.

**Vercel serves one deployment on several hostnames, and OAuth matches them exactly.**
`referral-hub-prradyumns-projects.vercel.app` (production) and
`referral-hub-git-main-prradyumns-projects.vercel.app` (branch alias) are the same build,
but each advertises *its own* host as the OAuth callback. Only the first is registered with
Google, so the second failed with `redirect_uri_mismatch`. Registering every
auto-generated alias is a treadmill; setting `AUTH_URL` to the production origin makes all
of them use one canonical callback. `curl -s <host>/api/auth/providers` prints the callback
each host will use — that is the fastest way to see the problem.

**Auth.js needs a redirect URI per *path*, not per project.** The Supabase-era entry
`…supabase.co/auth/v1/callback` does not match `…/api/auth/callback/google`. The Google
OAuth client itself is unchanged and still correct — only the URI list was stale. Removing
Supabase from the code does not touch Google Cloud, which confused us for a while.

**`next/image` refuses SVG** unless `dangerouslyAllowSVG` is set, so an `<Image
src="/icon.svg">` breaks the logo on every page. Inline the SVG as a component instead —
`src/components/Logo.tsx`.

**Interactive zsh does not treat `#` as a comment.** Pasting a multi-line block with
trailing `# explanations` runs them as arguments, and an apostrophe inside one opens a
quote that never closes: the shell sits at `quote>` and nothing runs. Paste commands one
at a time, without comments.

**`vercel link` rewrites `.env.local`.** It adds `VERCEL_OIDC_TOKEN` and pulls down the
project's variables, which is how `DATABASE_URL` and `AUTH_GOOGLE_SECRET` finally got into
the local file. Useful, but check the file afterwards rather than assuming.

**`next build` imports every module to collect page data.** A `pg.Pool` built at module
scope therefore fails the build on any machine without `DATABASE_URL` — including Vercel's
builder. `src/lib/db.ts` builds the pool on first query instead.

**React flags `setState` inside an effect, and it was right both times.** ESLint found it
in `WelcomeDialog` and `ReferralForm`; both are now derived during render. A `<dialog>`
holds its own open state, so drive the element and do not mirror it in React.

---

## 9. Security, privacy and tax

### DPDP

The Digital Personal Data Protection Rules were notified **13 November 2025**, phased:
the Data Protection Board immediately, the consent manager framework **13 November 2026**,
and **all remaining substantive obligations 13 May 2027**. This product will be live well
inside that window. Build to the obligations; do not retrofit.

We collect personal data about **people who do not work here** — candidates. That is the
sharpest legal edge in the project.

| Obligation | How it is met |
| --- | --- |
| Notice and consent | The referrer confirms the candidate agreed; the exact notice text and timestamp are stored on the referral. **Built in Phase 0** |
| Purpose limitation | Candidate data is for this recruitment process only. No marketing, no talent pool without separate consent |
| Minimisation | Name, contact, employer, designation, LinkedIn, résumé. Nothing else. No DOB, no salary, no ID documents |
| Security | Encryption in transit and at rest, RLS, private storage with signed URLs, no PII in logs |
| Breach notification | Documented procedure and a named owner — **not yet done** |
| Retention and erasure | Scheduled purge after a defined window — **window not yet decided, see D14** |
| Grievance route | A named contact published in the Hub — **not yet done** |

The consent notice text lives in `CONSENT_NOTICE` in `src/lib/validation.ts` and is copied
onto every referral row. Changing it changes only future referrals — which is the point.

### Tax — easy to miss, expensive to miss

A referral bonus paid to an employee is **taxable salary income in India** and must flow
through payroll with TDS. It cannot be a reimbursement or a petty-cash payout. Physical
gifts above the prescribed threshold are a perquisite and similarly taxable. Confirm the
treatment with finance in writing before the first payout, and show the employee gross,
deduction and net so nobody is surprised by a payslip.

### Other security work owed

Résumé scanning before the file becomes readable. Every CSV export and résumé download
audited, because both move candidate PII. Rate limits on submission — cash plus a
leaderboard is an incentive to spray résumés. Service-account credentials in a secret
manager, rotated, never in the repo.

---

## 10. Open decisions — HR must answer before Phase 1

Eighteen questions block the build. Each one changes a table, an integration contract, the
money, or what we may legally store. The full log with space to answer is linked in §14.

### Settled

1. **Anyone may submit a referral, including HR and TA.** Exclusions apply at reward time,
   not at submission.
2. **An employee serving notice is not eligible** for a reward.

### Still open

| ID | Decision | Why it blocks |
| --- | --- | --- |
| D01 | Which entities, geographies and populations are in scope; do interns/contractors/consultants get a login and can they earn? | Sync scope and auth |
| D02 | The exact exclusion list — and does it depend on hiring-manager identity or interview-panel membership? | **Panel membership is often not exposed by any ATS API.** If so the rule cannot be automated and the policy must be written differently |
| D03 | Is exclusion judged at referral, at joining, or at payout? | Snapshot vs live evaluation; retrofitting means backfilling every referral |
| D04 | Notice period — resignation date or last working day? Can the HRMS give us that field? | Many HRMS expose only the last working day |
| D05 | One payment or split (e.g. half on joining, half at six months)? | A split is a second eligibility date, approval and payroll line. Cheap now, a rebuild later |
| D06 | Does the qualifying clock start at joining or at confirmation — and is that date reliable? | Every eligibility date derives from it |
| D07 | Referrer resigns: what happens to an in-flight referral and to an approved-but-unpaid reward? Is forfeiture reversible if the resignation is withdrawn? | Reversible and terminal are different state machines |
| D08 | Is a paid reward ever recovered, and will payroll execute a recovery? | A reversal path touches reward states, the payroll file and the employee's view |
| D09 | Does finance co-approve above a threshold? | An extra state and an extra permission |
| D10 | **One referral per candidate, or per candidate *and* role?** | The unique key on `referrals`. Hardest thing on this list to change once data exists. **Currently built as per-candidate across all roles** |
| D11 | Does a prior direct application or agency submission defeat a later referral, and how far back? | Requires the ATS to expose full prior application history |
| D12 | Are milestones lifetime-cumulative or reset each financial year — and does existing history count? | The prototype's milestone track says lifetime while its leaderboard says rolling FY. Both cannot be true |
| D13 | Finance to confirm: payroll + TDS, gifts as perquisite, advertised amount is gross | Exposure, not a product problem |
| D14 | Who obtains candidate consent, in what words — and what is the retention window? | **Consent capture is built; the wording and retention window are not decided** |
| D15 | Exactly what a referrer may and may never see | Becomes the status map and a read permission |
| D16 | Manager over their team, HR across the org, recruiter over assigned roles only? | Row-level security rules |
| D17 | Confirm the approval matrix — cash, gifts, stage override, configuration | Permissions and workflow states |
| D18 | Policy effective date, and what happens to referrals in flight in the current process | Migration |

### Defaults already built, changeable if HR answers otherwise

| Topic | Built as | Where to change |
| --- | --- | --- |
| Duplicate scope (D10) | Same normalised email **or** phone, across all roles | The `exists (…)` clause in `submit_referral` |
| Referral validity | Six months | `app_settings.referral_validity_months` |
| Allowed domain | `convegenius.ai` | `app_settings.allowed_email_domain` + env var |
| Rate at submission | Snapshotted onto the referral | `submit_referral` |
| Consent notice | Stored verbatim per referral | `CONSENT_NOTICE` in `src/lib/validation.ts` |

---

## 11. Infrastructure

The Supabase free-plan problem — projects pause after a week of inactivity, no backups —
was the reason this section existed. Moving to Neon removed it: a Neon free database
sleeps when idle and wakes on the next connection, and nothing is deleted.

What is still owed before a pilot:

- **A staging database.** One Neon store per environment; Preview deployments should not
  write to production rows.
- **Backups with a tested restore.** Neon's free tier keeps a 24-hour restore window.
  That is not enough for payout records — either move to Neon's paid tier or run a
  nightly `pg_dump` to object storage. Untested backups do not count.
- **Somewhere for résumés.** Phase 0.5 needs a private file store with signed URLs.
  Supabase Storage was the plan; Vercel Blob is the obvious replacement now.
- **The region question in §4.**

### Running cost, steady state

| Line | Monthly (USD) |
| --- | --- |
| Database, production (Neon paid) | 19 |
| Database, staging | 0–19 |
| Application hosting | 20 |
| Worker container | 10 |
| Transactional email | 20 |
| Error tracking and logs | 30 |
| Malware scanning | 0–15 |
| **Total** | **≈ 130–145** |

Roughly ₹11,000–12,500 a month. The prototype's own analytics put one referral hire at
₹32,862 in rewards and gifts — the platform costs less per year than four referral hires.

---

## 12. Phases

Sized for two full-stack engineers with part-time design, QA and product. Durations are
elapsed weeks for that team.

### Phase 0 — complete

Sign in, browse roles, refer, track. Schema, the submit function, Google sign-in through
Auth.js, consent capture, duplicate detection. RLS was built and then removed with
Supabase Auth — authorisation now lives in the server layer (§6).

### Phase 0.5 — finish the slice (1–2 weeks)

Small, and it makes Phase 0 genuinely usable.

- **Résumé upload** — Vercel Blob private store, signed URLs, 5 MB cap, MIME and
  magic-byte check, malware scan before the file is readable
- **Referral detail page.** The journey timeline now renders on the list, but from
  `showcase.ts` with illustrative offsets from the real `submitted_at`; wire it to
  `referral_stages` and give each referral its own page
- ~~**Policy and FAQ content**~~ — done, `/how-to-refer`: five steps, the policy in plain
  terms, a benefits summary and a slot for the video Comms still owes
- Delete the stale Google client secret `g80a`, the dead Supabase redirect URI, and the
  Supabase project itself
- Rename the Google OAuth client and set the consent-screen name deliberately (§4)
- Accessibility pass: labels, focus management, keyboard paths, dialog semantics
- A real domain (`referrals.convegenius.ai`), which also retires `AUTH_URL` and the alias
  problem in §8

### Phase 1 — pilot: refer, track, get paid (8–10 weeks)

Everything marked P0. Requires Phase 0 of the *decisions* — the integration contracts —
to be settled first.

**Integrations.** All three are **Keka** (§16), which is a material simplification of
what this section originally assumed: one vendor, one credential, one client, rather than
three unknown systems. ATS adapter (hourly pull: jobs, candidates, stage changes,
idempotent upsert on external ID) — **jobs pull and candidate push are built**. HRMS
adapter (nightly: identity, department, manager, location, status, join and exit dates).
Payroll — **an API, not the file exchange assumed here**: Keka exposes
`GET /payroll/bonustypes` and `PUT /payroll/paygroups/paycycles/adhoctransactions`, so a
reward can be posted as an ad-hoc payroll transaction. Confirm with finance before using
it; D13 still governs the tax treatment.

**Engines.** Status mapping (ATS stage → employee wording → notification, including
deliberately silent stages). Eligibility (scheduled job flipping rewards eligible at day
30 or 90, reversing if the hire exits inside the window). Notification (rules + templates
+ outbox). Scheduler via `pg_cron` and a Postgres-backed queue — no Redis, no Kafka.

**Employee.** Eligibility gate. Cash reward tracker with eligible-from, status and payroll
month. Tax visibility. In-app and email notifications.

**Admin (six screens, not fifteen).** All-referrals table with ATS stage beside
employee-visible stage. Referral detail. Duplicate and flag queue. Cash reward pipeline
with a working approve. Payroll handoff. Audit log.

**Platform.** Immutable audit via database triggers. Idempotency, retry, dead-letter.
Backups with a *tested* restore. Error tracking and alerting. The three reconciliation
checks: joined candidate with no reward record; approved reward with no payout; dispatched
gift never delivered.

*Exit: one department referring for real, with a payout completed end to end through
payroll.*

### Phase 2 — full rollout: gifts and operations (6 weeks)

Everything marked P1.

Gift fulfilment workflow — validate eligibility → approve → initiate procurement →
procured → ready → dispatch with tracking → delivered, each step gated to the legal next
action **and each one actually persisting**. Gift issue resolution (never swap silently).
Employee gift tracking. Milestone engine. Query desk with responses visible to the
employee. The full nine-check exception queue with counts that reconcile to the detail.
Notification rules editor. Integration health screen. Programme analytics. CSV export,
audited. Recruiter assignment and stage override with mandatory reason. Retention and
erasure jobs. Leaver handling. Rate limiting.

*Exit: open to all 1,240 employees, HR operating the programme entirely inside the Hub.*

### Phase 3 — engagement and insight (4–6 weeks)

Everything marked P2.

Leaderboard with period filters that actually filter — behind a feature flag, because
public ranking of colleagues is a culture decision, not a product one. Badges. Share a
role. Slack or SwiftChat notifications. Weekly priority-roles digest. Adoption funnel on
real event data. Gift inventory. Bulk actions. View-as-employee (audited). Scheduled
reports. Hindi interface.

*Exit: participation measured against a baseline, with the funnel showing where the
remaining drop-off actually is.*

### Team

| Role | Allocation |
| --- | --- |
| Tech lead / full-stack | Full time — schema, RLS, integrations, worker, review |
| Full-stack engineer | Full time — screens, API, tests |
| Product designer | ~40% |
| QA | ~40% from Phase 1 |
| Product / HR owner | ~30% |

Roughly five months elapsed to full scope, pilot at around three. **The critical path runs
through confirming the integrations** — every week waiting for ATS credentials is a week
added to the end.

---

## 13. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| The ATS has no usable API, or it needs a licence upgrade | Severe — the whole status pipeline depends on it | Confirm first. Fallback is a recruiter-operated stage screen inside the Hub: worse, but shippable |
| Payroll cannot consume a structured file | High | CSV with a documented column contract; accept manual keying, with the Hub as the record |
| Procurement stays manual | Medium | Build the admin workflow first, treat integration as optional, add an ageing alert |
| Permission bug leaks candidate or reward data | Severe — **raised since RLS was removed** | Every query filters explicitly by employee id; server-layer authorisation tests in CI; revisit RLS keyed on a session variable before the first multi-role feature |
| Reward disputes over who referred first | Medium | Immutable timestamps, an explainable rule, policy visible before submit |
| Adoption stalls | Medium | Ship policy and how-to content as P0; measure the funnel from day one |
| Scope creep from the prototype's fifteen admin screens | Medium | The priority bands are the defence. Phase 1 ships six |


---

## 14. Companion documents

- **Build spec** — full feature register (82 features with IDs and priorities), architecture, data model, integrations, NFRs: `https://claude.ai/artifact/VMewhfUjd3VAriTCkj9bAy`
- **Policy decision log** — the eighteen blocking questions, answerable in place, shared with HR: `https://claude.ai/artifact/P6WcgwsBD3VQAkEiztUGiV`
- **Original prototype** — `https://employee-referal-dashboard.lovable.app` — read for copy and state model, do not port the code
- **README.md** — setup and run instructions

---

## 15. Immediate next actions

Phase 0 runs, in production, verified by the scripts in §3. The Keka integration is
written but unverified (§16), so what is left is one console errand, one read-only script
run, and the decisions.

**Console work nobody has done yet — all of it needs a human with the right logins:**

1. **Delete the Supabase project.** It still answers (`401`, not `404`), so it still
   exists and still holds a copy of the schema and any rows from before the migration.
2. Delete the stale Google OAuth secret `****g80a` and the dead
   `…supabase.co/auth/v1/callback` redirect URI. Google allows only two secrets, so the
   dead one blocks future rotation.
3. Set the Google consent-screen name deliberately — it currently reads **"CG HR
   Portal"** (§4).
4. **Settle Neon's plan and backups.** §11 rejected the Supabase free tier for having no
   backups; that objection applies to any free tier holding payout records. Confirm the
   retention Neon actually gives you, and take a branch or a paid plan for staging.

**Keka, now that it is confirmed as the ATS, HRMS and payroll system (§16):**

5. **Run `npm run keka:discover` against the tenant.** Nothing else in the integration can
   be verified until it has, and it answers the two questions the documentation cannot:
   which `JobStatus` values mean open, and what the hiring stage ids are. It is read-only.
   Then apply `db/0003_keka.sql` and run one full sync.

**Then, in priority order:**

6. Get §10 in front of HR. **D02, D04, D10, D11 and D12 are the ones that stall
   engineering.**
7. ~~Confirm which ATS, HRMS and payroll systems are in use~~ — **Keka, all three**,
   confirmed 21 Sep 2026, credentials in hand (§16). Procurement is still unconfirmed.
   Note that Keka can settle **D04** and **D06** by inspection rather than by waiting on
   HR: `/hris/noticeperiods` and the exit-request endpoints do expose notice period.
8. Finance to confirm the tax treatment in writing (D13).
9. Get the showcase screens in front of HR while they are cheap to change. That is what
   they are for, and changing a layout now costs nothing next to changing it after the
   engines are built.
10. Build Phase 0.5 while the above is being chased — none of it is blocked by HR.

---

## 16. Keka integration

Added 21 September 2026. ConveGenius runs **Keka Hire (ATS), Keka HRIS and Keka Payroll**,
so all three Phase 1 integrations are one vendor behind one credential.

**The jobs sync is live.** As of 21 September 2026 the Hub reads its roles from Keka:
906 jobs pulled in 11.7s, 56 open and browsable at `/roles`, the ten prototype roles
retired, and the referral flow re-verified end to end against a real Keka job by
`scripts/e2e-refer.mjs` and `scripts/e2e-scoping.mjs`.

The **candidate push is still blocked** — it has never been executed. §16 *The push is
blocked* explains why, and it is a policy decision rather than a coding task.

### What is built

| Piece | File | State |
| --- | --- | --- |
| API client — token cache, rate limit, paging, retry | `src/lib/keka/client.ts` | Auth + paging verified live |
| Pure Keka ↔ Hub mapping | `src/lib/keka/map.ts` | 52 assertions, all passing |
| Jobs pull and reconcile | `src/lib/keka/jobs.ts` | **Live** — 906 read, 906 written, 11.7s |
| Candidate push | `src/lib/keka/candidates.ts` | **Blocked** — see *The push is blocked* |
| Sync run recording and health | `src/lib/keka/sync.ts` | Live, recording runs |
| Scheduled entry point | `src/app/api/cron/keka/route.ts` | Live locally; Vercel cron not yet on |
| Credential + scope audit | `scripts/keka-verify.mjs` | **Run 21 Sep: passes, least privilege confirmed** |
| Tenant reconnaissance | `scripts/keka-discover.mjs` | **Run 21 Sep: see the tenant table below** |
| Mapping tests | `scripts/keka-mapping-check.mjs` | `npm run keka:check` |
| Schema | `db/0003_keka.sql` | **Applied to Neon** 21 Sep |

### Credentials and how they are protected

Issued by a Keka **Global admin** only: Global admin settings → Integrations &
Automations → API access → API key. No other admin role can create them, and the key must
carry the **recruitment scopes** or `/v1/hire/*` answers 403 while the token itself
succeeds — a confusing failure worth recognising quickly. `npm run keka:verify` names that
case explicitly rather than leaving you to guess.

Four things enforce the handling, rather than relying on anyone remembering:

- **`src/lib/keka/client.ts` imports `server-only`.** If any client component ever reaches
  it, the **build fails** instead of bundling the Keka client secret into browser
  JavaScript. `src/lib/db.ts` carries the same guard now, which CONTEXT.md had asked for
  in prose since Phase 0. Verified by deliberately importing it from a client component
  and watching the build refuse.
- **`npm run env:set` handles the values, not a text editor.** It strips the trailing
  full stop a secret picks up when copied out of prose (§8), rejects a `KEKA_COMPANY` that
  is a full host rather than a subdomain, generates `CRON_SECRET`, and writes `.env.local`
  `0600`.
- **`npm run keka:verify` audits least privilege.** It probes every Keka module and
  reports anything the key can read that the Hub never touches — salaries, documents,
  attendance, performance. A referral tool holding a key that can read payroll widens the
  blast radius of a leak for no benefit. It prints fingerprints, never secrets.
- **`CRON_SECRET` is compared in constant time** (`timingSafeEqual`), and the route
  refuses every request when it is unset rather than defaulting open.

Separate keys per environment: sandbox credentials only work against `*.kekademo.com`,
production only against `*.keka.com`. Never put a production key in a local `.env.local`.
Set an expiry when issuing — Keka keys default to never expiring.

```
KEKA_COMPANY=…        # the subdomain in <company>.keka.com, no protocol
KEKA_CLIENT_ID=…
KEKA_CLIENT_SECRET=…
KEKA_API_KEY=…
KEKA_ENV=production   # or sandbox, which is *.kekademo.com
CRON_SECRET=…         # openssl rand -base64 32
```

Token: `POST https://login.keka.com/connect/token`, form-url-encoded, with
`grant_type=kekaapi` **and** `scope=kekaapi` — `client_credentials` is not the grant here.
Tokens last 24 hours. Keka's docs warn that requests without a `User-Agent` are rejected
from non-browser clients, so the client always sends one.

API base is `https://{company}.keka.com/api`. **Rate limit is 50 requests per minute**,
429 on breach; the client throttles itself at 45 and honours `Retry-After`.

### What the tenant actually looks like

Measured 21 Sep 2026 with `npm run keka:discover`.

| | |
| --- | --- |
| Jobs | **906**, across 5 pages of 200 |
| Referral-enabled | **364** of 906 |
| Candidates seen (8-job sample) | 699 |
| Hiring stages seen | `Sourced`, `Shortlisted` |
| `sourceTitle` values in use | Career Portal, Indeed Job Posts, **Employee Referral**, Consultant |

Job status distribution — the enum Keka does not publish:

| status | jobs | referral-enabled |
| --- | --- | --- |
| 1 | 56 | 56 / 56 |
| 2 | 817 | 307 / 817 |
| 3 | 29 | 1 / 29 |
| 4 | 4 | 0 / 4 |

**Which of these means "open" is still unanswered** and needs someone to open one job of
each status in the Keka UI. It matters: `keka_open_job_statuses` currently defaults to `1`,
which would surface 56 roles. Adding `2` would surface 363. CONTEXT.md §2 assumes ~32 open
roles at a time, so 906 job records is clearly a long history rather than a live pipeline.

Good news on stages: **`jobHiringStageId` is a readable name, not a GUID** — the tenant
returns `Sourced` and `Shortlisted`. `keka_stage_map` still governs what an employee sees,
but filling it is a much smaller job than feared.

### Three things the tenant taught us that the documentation got wrong

**Every module sits under `/v1`, not just Hire.** `/hris/employees` is a 404;
`/v1/hris/employees` is a 403. The documentation's URL slugs omit the prefix for
everything except recruitment. This matters beyond tidiness: the first version of
`keka-verify.mjs` probed unprefixed paths, read the resulting 404s as "access denied" and
printed a **falsely reassuring least-privilege pass**. It now distinguishes 404 (wrong
path, not checked) from 401/403 (genuinely denied).

**Keka returns dates as Unix epoch seconds in a string** — `"1789573328.01"` — although
its OpenAPI types them `date-time`, and `publishedOn` is usually `""` rather than absent.
`new Date("1789573328.01")` is an Invalid Date, so the obvious parse silently stamped
every synced job with today's date. `parseKekaDate()` in `src/lib/keka/map.ts` handles
epoch seconds, epoch milliseconds and real ISO strings, and there are regression tests
pinned to the exact strings the tenant sent.

**But `lastModified` on the way *in* must be ISO 8601.** Epoch seconds are rejected with
400. Verified: a far-future ISO filter returns 0 of 906, a far-past one returns 906. So
Keka speaks epoch outbound and ISO inbound, and the watermark sync is correct as written.

Also: `experience` is a free-text string — `"3"`, `"3-5"`, `"10 - 14"`, `"5 years"` —
and `departmentName` is missing on 126 of 906 jobs.

### The push is blocked

`GET /v1/hire/jobs/{id}/applicationfields` reports **8 required fields** on every job
sampled:

`firstName`, `lastName`, `email`, `phone`, `workExperience`, **`currentSalary`**,
**`expectedSalary`**, `availability`

The Hub's referral form collects the first four. It collects none of the last four, so
**the candidate push as built would be rejected**, and `keka_push_candidates` stays
`false` until this is resolved.

The salary fields are not merely a missing input. §9 commits this product to DPDP
minimisation in as many words — *"Name, contact, employer, designation, LinkedIn, résumé.
Nothing else. No DOB, no salary, no ID documents."* Asking an employee to supply a
colleague's current and expected salary contradicts that, and referrers frequently do not
know it and would guess. **Do not solve this by adding salary fields to the referral
form.** The options are to have Keka mark those fields optional on referral-enabled jobs
(they are configured per job, so this is HR config rather than code), or to leave the push
off and have TA work from the Hub's own list.

### Three more things the live sync taught us

**Keka's `orgJobId` is not unique.** 906 jobs use 905 distinct values — `CGJOB764` appears
twice — but `jobs.req_id` is declared `unique` back in `0001`. The first sync died on
`jobs_req_id_key` after writing 230 rows. `upsert_keka_jobs` now takes the readable code
when it is free and appends the Keka id when it is not, and never rewrites `req_id` on
conflict, so whichever row claimed the bare code keeps it. The raw value lives in
`jobs.keka_org_job_id`.

**One round trip per job does not work from here.** §4's ~250ms Virginia latency turned
906 sequential upserts into a >70s sync that would have breached the route's 300s ceiling
outright on a slower day. The whole page now goes over as one `jsonb` argument and loops
inside Postgres: **11.7 seconds** for all 906.

**45% of job descriptions open with the same paragraph.** 384 of 860 begin *"Does working
for 150+ million children of Bharat excite you? … About us: ConveGenius is …"*, so half
of `/roles` said exactly the same thing and nothing about the job. `stripBoilerplate()`
skips to the first role heading — `Role Summary`, `About the role`, `Key
Responsibilities` — but only when the text actually opens with the preamble *and* a
heading exists later, so a description written the other way round is untouched.

### Rewards are not Keka's to give

Keka has no concept of a referral reward, so every discovered role lands with the
`keka_default_reward_amount` placeholder. 56 roles all displaying the same invented
₹10,000 is precisely the failure convention 1 exists to prevent, so `jobs.reward_confirmed`
gates it: until HR sets a real figure the card reads **"To be confirmed"** rather than a
number. `rewardLabel()` in `src/lib/format.ts` is the single place that decides this, and
`/roles` and the refer flow both use it.

Setting the real figures is now the main thing standing between this and a usable
programme. It is data entry against `jobs.reward_amount` plus `reward_confirmed = true`,
not code.

### The two things the documentation cannot tell you

These are why `scripts/keka-discover.mjs` exists, and why the integration is not simply
switched on.

**1. `JobStatus` is an integer with no published enum.** Which values mean "open" is a
tenant fact. It lives in `app_settings.keka_open_job_statuses` and defaults to `1`.
The default is deliberately narrow: an unconfirmed status is treated as closed, so the
failure mode is a role missing from the Hub rather than referrals taken for a role that
stopped hiring.

**2. There is no endpoint that lists hiring stages.** Candidates carry a
`jobHiringStageId` and nothing resolves it to a name. `keka_stage_map` is therefore filled
by observation: the discovery script reports the distinct ids a tenant uses, and a human
writes the employee-facing wording. **Until a row exists, a stage is stored but never
shown.** The Hub does not invent a label for a stage it does not recognise — that is
commitment 1 and convention 1, and it is the difference between this and the prototype.

### Design decisions worth not relitigating

**Keka owns job facts; the Hub owns job money.** The sync overwrites title, department,
location, experience band, open/closed, summary and posted date. It never writes
`reward_amount`, `eligibility_days` or `is_priority` — those are programme config
(convention 2 and 4), and an hourly job that reset them would silently undo HR's work.
`upsert_keka_job` in `db/0003_keka.sql` enforces this by which columns its `on conflict`
clause omits. **Do not add them to that list.**

**A role is referable only if Keka says open AND `isReferralEnabled`.** Turning referrals
off on a job in Keka therefore withdraws it from the Hub, which is what HR expects that
switch to do.

**The candidate push can never cost an employee their referral.** `submit_referral`
commits first; the push runs in Next's `after()`, so it adds no latency to the submit and
cannot fail it. Failures land in `referrals.keka_push_error` and are retried by the
sweeper on the cron route. A referral is complete and valid having never reached Keka.

**A 400 from the candidate POST is not retried.** It means our body is wrong for that
tenant's required fields, and an identical retry will fail identically. It is marked
permanent and left for a human.

**The push is off by default** — `app_settings.keka_push_candidates` is `false` — because
the per-job required application fields are a tenant fact we have not seen. Turn it on
only after the discovery script shows the form can satisfy every required field.

**Referrer attribution goes in a candidate note.** Keka documents no referrer field on
the candidate POST, and custom fields vary per tenant, so the note is the one channel
guaranteed to exist. Matching Keka candidates back to Hub referrals is by **normalised
email**, which the Hub already computes; it does not depend on a custom field existing.

**`interviews` and `scorecards` are never synced.** Both endpoints exist. Commitment 2
says feedback and scores stay in the ATS, and the safest way not to leak data is not to
hold it. Do not add them.

**Reconcile only runs on a full pull, and refuses an empty response.** A watermarked pull
cannot see a job deleted in Keka, so a nightly full run closes anything missing. If Keka
returns zero jobs it throws rather than closing every role in the Hub — an empty list is
far more likely to be a Keka fault than every role closing at once.

**A failed sync run does not advance the watermark.** `last_sync_watermark()` reads only
from runs that succeeded, so the next run re-reads the window the failed one missed
rather than skipping it forever.

### Scheduling

`vercel.json` registers two crons: hourly incremental, and a full run with reconcile at
02:30. **Vercel's Hobby plan allows daily cron only** — the team is on Hobby (§4), so
hourly needs Pro. The §11 cost table already budgets $20/month for hosting, so this is a
planned spend rather than a surprise, but the hourly schedule will not fire until the plan
changes.

`/api/cron` is exempted in `src/proxy.ts`. Without that the proxy redirects the scheduler
to `/login` and the sync silently never runs. It authorises on `CRON_SECRET` and **refuses
every request when that is unset** rather than defaulting open.

### Running it

```bash
npm run env:set                       # enter the credentials safely
npm run keka:check                    # mapping tests — no credentials needed
npm run keka:verify                   # credential works? over-granted? read-only
npm run keka:discover                 # read-only tenant reconnaissance
npm run db:apply                      # applies db/0003_keka.sql

# with the dev server running:
curl -H "authorization: Bearer $CRON_SECRET" \
     'http://localhost:3000/api/cron/keka?full=1'
```

Run discovery **before** the first sync. It reports the status values, the referral-enabled
count, the per-job required application fields and the distinct stage ids — which is
exactly the input `keka_open_job_statuses` and `keka_stage_map` need.

### Still owed

- **Set the real reward per role** — 56 open roles currently read "To be confirmed"
- Confirm `keka_open_job_statuses`. It is `1`, giving 56 roles; adding `2` would give 363.
  `select * from rederive_keka_job_openness();` applies a change with no re-sync
- Fill `keka_stage_map`, then wire `/referrals` to real stages and **delete
  `referralJourney` from `src/lib/showcase.ts`** — that timeline is currently invented
- Confirm the candidate POST body against a real job's required fields, then enable
  `keka_push_candidates`
- The stage pull itself: `GET /v1/hire/jobs/{jobId}/candidates` with `lastModified`,
  writing to `referral_stages`. Candidates are fetched **per job**, so ~32 open roles is
  ~32 calls per cycle — comfortably inside 50/min, but not something to parallelise
- HRIS sync for employees, which also settles **D04** (`/hris/noticeperiods` and the exit
  request endpoints do expose notice period) and **D06** (joining and confirmation dates)
- Decide whether reward payout uses the payroll API or a file (D05, D13)
