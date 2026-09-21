# Referral Hub — Phase 0

The first working slice of the ConveGenius Referral Hub: an employee signs in with their
work Google account, browses open roles, refers someone, and sees that referral in their
own list. Real database, real rows.

> **New here? Read `CONTEXT.md` first.** It holds the full project context — live
> environment and credentials map, database design and the reasons behind it, the rules
> future work must follow, gotchas already paid for, open HR decisions, and every
> remaining phase. This README only covers setup and running.

Stack: Next.js 16 (App Router) · TypeScript · Auth.js v5 with Google · Postgres (Neon) ·
Tailwind CSS 4.

---

## Setup

Three things to fill in, then two commands.

### 1. `.env.local`

```bash
cp .env.example .env.local
```

| Variable | Where it comes from |
| --- | --- |
| `DATABASE_URL` | Vercel → Storage → the Neon store → Getting Started → the **.env.local** tab → **Copy Snippet**. Use the pooled `DATABASE_URL`, not `DATABASE_URL_UNPOOLED`. It already contains the password. |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google Cloud → APIs & Services → Credentials → the OAuth 2.0 Client ID. Google shows a secret **once**, at creation — copy it with the copy button, never a drag-selection. If it is lost, add a new secret rather than recreating the client. |
| `ALLOWED_EMAIL_DOMAIN` | `convegenius.ai`. Must match the `allowed_email_domain` row in `app_settings`. |
| `KEKA_COMPANY` / `KEKA_CLIENT_ID` / `KEKA_CLIENT_SECRET` / `KEKA_API_KEY` | Keka → Global admin settings → Integrations & Automations → API access → API key. Only a Global admin can issue them, and the key needs the **recruitment** scopes or `/v1/hire/*` returns 403 while the token still succeeds. Optional — the app runs without them, just without Keka. |
| `CRON_SECRET` | `openssl rand -base64 32`. Protects `/api/cron/keka`, which refuses every request when this is unset. |

The Google client needs `<your-origin>/api/auth/callback/google` in its **Authorised
redirect URIs** — `http://localhost:3000/api/auth/callback/google` for local development.

### 2. Create the schema

```bash
npm install
npm run db:apply
```

That applies every file in `db/` in filename order — schema, seed, then the Keka tables —
against `DATABASE_URL`, and prints a row count to prove it worked. It is safe to re-run;
every statement is idempotent.

Together they are a complete schema for any standard PostgreSQL 14+ database. They replace
the old `supabase/migrations/0001..0003` trio, which referenced `auth.users` and the
`anon` / `authenticated` API roles and only ever worked on Supabase.

### 3. Run it

```bash
npm run dev
```

Open http://localhost:3000 and sign in with an `@convegenius.ai` Google account.

---

## What Phase 0 does

| Screen | Path | Notes |
| --- | --- | --- |
| Sign in | `/login` | Google only, restricted to the work domain |
| Open roles | `/roles` | Search and filters run as a GET form, so every filtered view has its own URL |
| Refer someone | `/refer` | Two steps — details, then a review screen before submit |
| My referrals | `/referrals` | Your own referrals only |

The domain restriction is enforced three times: the `hd` hint narrows Google's account
chooser, the `signIn` callback in `src/auth.ts` rejects anything else, and the
`enforce_employee_domain` trigger rejects it again at the database.

## Keka

The ATS, HRMS and payroll system is **Keka**. The jobs pull and the candidate push are
built but **have not yet been run against the tenant**. Before switching either on:

```bash
npm run env:set         # enter the credentials safely (never hand-edit them)
npm run keka:check      # mapping tests — no credentials, no network
npm run keka:verify     # does the credential work, and is it over-granted?
npm run keka:discover   # read-only reconnaissance of the tenant
npm run db:apply        # applies db/0003_keka.sql
```

`keka:discover` writes nothing, to Keka or to Postgres. Run it first: two things the
integration needs are not in Keka's documentation and can only be learned from a real
tenant — which `JobStatus` integers mean "open", and what the hiring stage ids are.
CONTEXT.md §16 is the full picture.

Then, with the dev server running:

```bash
curl -H "authorization: Bearer $CRON_SECRET" \
     'http://localhost:3000/api/cron/keka?full=1'
```

Two rules worth knowing before you touch it. **The sync never writes `reward_amount`,
`eligibility_days` or `is_priority`** — Keka owns job facts, the Hub owns programme
config. And **the candidate push can never fail a referral**: it runs after the response
is sent, and failures are recorded and retried.

## What Phase 0 deliberately does not do

No résumé upload, no admin portal, no rewards, gifts, milestones, leaderboard or
notifications. Referral status stays at *submitted* — the Keka stage pull is not built
yet, so the journey timeline on `/referrals` is still illustrative.

## Decisions already encoded

These follow the defaults in the decision log. Each one is a small, contained change if HR
answers differently.

| Decision | What is built | Where to change it |
| --- | --- | --- |
| One referral per candidate (D10) | The duplicate check matches on normalised email **or** phone, across all roles | The `exists (...)` clause in `submit_referral` |
| Candidate consent (D14) | The notice text and the timestamp are stored on every referral | `CONSENT_NOTICE` in `src/lib/validation.ts` |
| Reward rate is locked at submission | `reward_amount_snapshot` is copied from the role at submit time | `submit_referral` |
| Referral validity | Six months | `app_settings.referral_validity_months` |
| Allowed sign-in domain | `convegenius.ai` | `app_settings.allowed_email_domain` and `ALLOWED_EMAIL_DOMAIN` |

## Notes for whoever picks this up

- **There is no row-level security.** It was removed with Supabase Auth, because Auth.js
  puts no `auth.uid()` into the database session for policies to key on. The
  `DATABASE_URL` role is the only identity that touches Postgres, and authorisation lives
  in server-only code. That means every `referrals` and `candidates` query must filter
  explicitly by the signed-in employee's id — there is no safety net underneath it.
  `CONTEXT.md` §6 has the full rules.
- Referrals can only be created through `submit_referral`, which takes the referrer's id
  as an argument. Always pass `employee.id` from `requireEmployee()`, never anything from
  the request body.
- The duplicate message never says who referred the candidate first. Keep it that way.
- `referral_stages` is append-only and already shaped for the ATS sync in Phase 1.
- `src/lib/db.ts` is Node-runtime only. Importing it from a client component will break
  the build.
- Next 16 renamed `middleware.ts` to `proxy.ts`; the export is `proxy`.

```
npm run typecheck     # tsc --noEmit
npm run lint          # eslint .
npm run build         # production build
npm run db:apply      # (re)create the schema and seed
npm run keka:check    # Keka mapping tests, no credentials needed
npm run keka:verify   # Keka credential check and least-privilege audit
npm run keka:discover # read-only Keka tenant reconnaissance
```
