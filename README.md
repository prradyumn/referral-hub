# Referral Hub — Phase 0

The first working slice of the ConveGenius Referral Hub: an employee signs in with
their work email, browses open roles, refers someone, and sees that referral in their
own list. Real database, real rows, real row-level security.

> **New here? Read `CONTEXT.md` first.** It holds the full project context — live
> environment and credentials map, database design and the reasons behind it, the rules
> future work must follow, gotchas already paid for, open HR decisions, and every
> remaining phase. This README only covers setup and running.

Stack: Next.js 16 (App Router) · TypeScript · Postgres on Supabase · Tailwind CSS 4.

---

## Setup

### 1. Create the Supabase project

Any project will do for development. Note the **Project URL** and the **anon public
key** from *Project Settings → API*.

> Before a pilot, move to the Pro plan. Free projects pause after a week of inactivity
> and keep no backups, which is not a defensible place for payout records.

### 2. Create the schema

In the Supabase SQL editor, run these two files in order:

1. `supabase/migrations/0001_init.sql` — tables, row-level security, the sign-up
   trigger, and the `submit_referral` function.
2. `supabase/seed.sql` — ten open roles so there is something to browse.

### 3. Configure auth

*Authentication → Providers* — make sure **Email** is enabled. No other provider is
needed; Phase 0 uses magic links.

*Authentication → URL Configuration*:

- Site URL: `http://localhost:3000`
- Redirect URLs: add `http://localhost:3000/auth/callback`

> Supabase's built-in email service is rate-limited to a handful of messages per hour,
> which is fine for one developer and not fine for a pilot. Configure your own SMTP
> under *Authentication → Emails* before more than a couple of people test this.

### 4. Run it

```bash
cp .env.example .env.local   # then fill in the two Supabase values
npm install
npm run dev
```

Open http://localhost:3000, enter an `@convegenius.ai` address, and follow the link in
the email.

---

## What Phase 0 does

| Screen | Path | Notes |
| --- | --- | --- |
| Sign in | `/login` | Magic link, restricted to the work domain |
| Open roles | `/roles` | Search and filters run as a GET form, so every filtered view has its own URL |
| Refer someone | `/refer` | Two steps — details, then a review screen before submit |
| My referrals | `/referrals` | Your own referrals only, enforced in the database |

The domain restriction is enforced twice: in the sign-in form, and again in the
`handle_new_user` trigger, so a link forged by hand still cannot create an account.

## What Phase 0 deliberately does not do

No resume upload, no admin portal, no rewards, gifts, milestones, leaderboard or
notifications. No ATS or HRMS connection — roles are seeded and referral status stays
at *submitted*. Those arrive in Phase 1, once the integration contracts are confirmed.

## Decisions already encoded

These follow the defaults in the decision log. Each one is a small, contained change
if HR answers differently.

| Decision | What is built | Where to change it |
| --- | --- | --- |
| One referral per candidate (D10) | The duplicate check matches on normalised email **or** phone, across all roles | The `exists (...)` clause in `submit_referral` |
| Candidate consent (D14) | The notice text and the timestamp are stored on every referral | `CONSENT_NOTICE` in `src/lib/validation.ts` |
| Reward rate is locked at submission | `reward_amount_snapshot` is copied from the role at submit time | `submit_referral` |
| Referral validity | Six months | `app_settings.referral_validity_months` |
| Allowed sign-in domain | `convegenius.ai` | `app_settings.allowed_email_domain` and `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN` |

## Notes for whoever picks this up

- Referrals can only be created through `submit_referral`. There is no insert policy on
  `referrals` or `candidates`, so the duplicate check cannot be bypassed by writing to
  the tables directly.
- The duplicate message never says who referred the candidate first. Keep it that way.
- `referral_stages` is append-only and already shaped for the ATS sync in Phase 1.
- `src/proxy.ts` refreshes the session cookie on every request. Removing it logs people
  out mid-task.

```
npm run typecheck   # tsc --noEmit
npm run build       # production build
```
