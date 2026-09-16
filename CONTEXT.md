# ConveGenius Referral Hub — Project Context

**Read this first.** It is the single source of truth for anyone — human or AI — picking
up this project. It covers what exists, what is live, why things are built the way they
are, what is decided, what is not, and what every remaining phase contains.

| | |
| --- | --- |
| Last updated | 16 September 2026 |
| Phase | 0 complete (auth + refer + track), Phase 1 not started |
| Auth | **Auth.js (NextAuth v5) + Google, JWT sessions.** Supabase Auth was removed on 16 Sep 2026 |
| Local path | `/Users/pradyumnawasthi/Downloads/referral-hub` |
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

- Sign-in by **Google**, work accounts only, through Auth.js. The `hd` hint narrows the
  Google account chooser, the `signIn` callback rejects any other domain, and a database
  trigger rejects it a third time
- Employee record created or matched on first sign-in by `currentEmployee()`, upserting on
  email
- Ten seeded open roles, browsable with search and filters
- Two-step referral submission with real validation and candidate consent capture
- Duplicate detection at submit, which never reveals who referred first
- "My referrals" list, scoped to the signed-in employee in the query itself

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

### Not built yet

No résumé upload (the field is absent, not broken). No admin portal. No rewards, gifts,
milestones, leaderboard or notifications. No ATS or HRMS connection — roles are seeded and
referral status stays at `submitted` forever.

---

## 4. Live environment

Nothing here is secret except where noted. Secrets live in `.env.local` (gitignored) and
in Vercel's environment variables.

### Supabase

| | |
| --- | --- |
| Project name | `referral-hub` |
| Project ref | `qnskrjxzeuuysbviqxhd` |
| URL | `https://qnskrjxzeuuysbviqxhd.supabase.co` |
| Region | South Asia (Mumbai), `ap-south-1` |
| Plan | **Free — must move to Pro before any pilot (see §11)** |
| Org | prradyumn's Org |
| Role | **Database only.** Supabase Auth, PostgREST and the API keys are no longer used |
| Connection | Supavisor **transaction pooler**, port 6543 — never the direct 5432 |
| Automatic RLS | Event trigger still enabled for new tables; the six existing tables have RLS off (see §6) |

**No Supabase API key appears anywhere in the app.** The only database credential is
`DATABASE_URL`, which is server-side and secret. The publishable key still exists in the
dashboard and still reaches PostgREST — which is exactly why migration `0003` had to
revoke EXECUTE from `public`. See §8.

### Google Cloud

| | |
| --- | --- |
| Project | `Referral Hub` / `referral-hub-508812` |
| Organisation | convegenius.ai |
| Consent screen | **Internal** — only convegenius.ai accounts, no Google verification needed |
| App name shown to users | ConveGenius Referral Hub |
| Support + contact email | pradyumn@convegenius.ai |
| OAuth client | `Referral Hub (Supabase)`, type Web application — the name is now historical |
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
| Env vars set | `ALLOWED_EMAIL_DOMAIN`, `AUTH_GOOGLE_ID` |
| Env vars still owed | `AUTH_SECRET`, `AUTH_GOOGLE_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN` |
| Removed | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

`NEXT_PUBLIC_SITE_URL` is still set and no longer read by anything — delete it.
**Production returns 500** until the four owed variables are added and the project is
redeployed.

---

## 5. Stack and repo layout

Next.js 16 (App Router) · React 19 · TypeScript 5.9 · Tailwind CSS 4 · **Auth.js v5**
(NextAuth beta — JWT sessions, no database adapter) · **node-postgres** straight to
Postgres on Supabase · Zod. Chosen to match ConveGenius's existing Node/TypeScript skills.

```
referral-hub/
├── CONTEXT.md                        ← this file
├── README.md                         ← how to set up and run
├── .env.local                        ← secrets, gitignored
├── .env.local.bak-supabase           ← pre-migration copy, also gitignored
├── .env.example
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql                       ← tables, functions, RLS (since undone)
│   │   ├── 0002_remove_supabase_auth.sql       ← revokes, RLS off, submit_referral v2
│   │   └── 0003_revoke_function_execute.sql    ← the EXECUTE hole 0002 left open
│   └── seed.sql                      ← ten open roles
└── src/
    ├── auth.ts                       ← Auth.js config: Google, hd hint, domain callback
    ├── proxy.ts                      ← route gating (Next 16's name for middleware.ts)
    ├── middleware.ts                 ← DOES NOT EXIST; Next 16 renamed it to proxy.ts
    ├── lib/
    │   ├── db.ts                     ← lazy pg.Pool on the pooler, Node runtime only
    │   ├── employees.ts              ← currentEmployee(), requireEmployee()
    │   ├── validation.ts             ← Zod schema, CONSENT_NOTICE, phone formatting
    │   └── format.ts                 ← rupees(), shortDate(), initials()
    └── app/
        ├── layout.tsx  globals.css  page.tsx
        ├── login/page.tsx            ← Google button, domain hint, error display
        ├── api/auth/[...nextauth]/route.ts   ← Auth.js handlers
        └── (app)/
            ├── layout.tsx            ← signed-in shell, requireEmployee()
            ├── roles/page.tsx        ← server component, GET-form filters
            ├── refer/page.tsx        ← loads jobs, renders the form
            ├── refer/ReferralForm.tsx← two-step client form
            ├── refer/actions.ts      ← server action → submit_referral
            └── referrals/page.tsx    ← own referrals only
```

### Commands

```bash
npm install
npm run dev         # http://localhost:3000
npm run build
npm run typecheck   # tsc --noEmit
```

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

## 11. Infrastructure — the one thing that must change before a pilot

**The Supabase free plan is not viable.** Free projects pause after one week of
inactivity, keep no backups, hold 500 MB of database and 1 GB of files, and retain logs
for one day. A referral programme has quiet weeks. A paused project means an employee
opens the Hub and it is simply gone, and a database holding payout records with no backups
is not defensible.

Move to **Pro, $25/month per project**: 8 GB database, 100 GB file storage, 250 GB egress,
daily backups kept 7 days, 7-day log retention, never paused. **Budget two projects —
staging and production.**

### Running cost, steady state

| Line | Monthly (USD) |
| --- | --- |
| Supabase production (Pro) | 25 |
| Supabase staging (Pro) | 25 |
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

- **Résumé upload** — Supabase Storage private bucket, signed URLs, 5 MB cap, MIME and
  magic-byte check, malware scan before the file is readable
- **Referral detail page** with the dated journey timeline (the table exists, no UI)
- **Policy and FAQ content** — their own funnel says understanding, not awareness, is the
  biggest drop, so this is a growth lever, not decoration
- Delete the stale Google client secret; move Supabase to Pro
- Accessibility pass: labels, focus management, keyboard paths, dialog semantics

### Phase 1 — pilot: refer, track, get paid (8–10 weeks)

Everything marked P0. Requires Phase 0 of the *decisions* — the integration contracts —
to be settled first.

**Integrations.** ATS adapter (hourly pull: jobs, candidates, stage changes, idempotent
upsert on external ID). HRMS adapter (nightly: identity, department, manager, location,
status, join and exit dates). Payroll (monthly file out, confirmation file in).

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

**Blocking the deployed app — Pradyumn, minutes each:**

1. Paste the database password into `DATABASE_URL`, and the Google client secret (the one
   ending `9qk0`) into `AUTH_GOOGLE_SECRET`, in `.env.local`.
2. Add `AUTH_SECRET`, `AUTH_GOOGLE_SECRET`, `DATABASE_URL` and
   `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN` to Vercel as Secret-type variables, delete
   `NEXT_PUBLIC_SITE_URL`, push the Auth.js code and redeploy. Production returns 500
   until this is done.
3. Delete the stale Google OAuth secret (`****g80a`) and the dead Supabase redirect URI
   `https://qnskrjxzeuuysbviqxhd.supabase.co/auth/v1/callback`.

**Then, in priority order:**

4. Get §10 in front of HR. **D02, D04, D10, D11 and D12 are the ones that stall
   engineering.**
5. Confirm which ATS, HRMS, payroll and procurement systems are in use, and who owns the
   credentials. Start this on day one — it is the critical path.
6. Finance to confirm the tax treatment in writing (D13).
7. Move Supabase to Pro and stand up a staging project.
8. Configure real SMTP before Phase 1 notifications.
9. Build Phase 0.5 while the above is being chased — none of it is blocked by HR.
