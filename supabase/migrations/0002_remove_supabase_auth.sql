-- Referral Hub · 0002 — remove Supabase Auth coupling
--
-- Phase 0 enforced permissions with row-level security keyed on auth.uid().
-- Authentication now happens in the application (Auth.js + Google), so auth.uid()
-- is always NULL and every one of those policies would fail closed. Permissions
-- move into application code; this migration removes the machinery that assumed
-- otherwise.
--
-- Run AFTER 0001_init.sql. Safe to re-run.

begin;

-- ===========================================================================
-- 1. CRITICAL: close the PostgREST door before disabling RLS
-- ===========================================================================
-- Until now, the publishable key was safe in the browser *because RLS stood
-- behind it*. Step 4 turns RLS off. If the Supabase REST API can still reach
-- these tables with the anon/authenticated roles, that key — which was shipped
-- in the client bundle and must be treated as public forever — would read and
-- write everything.
--
-- The application connects as the database owner over DATABASE_URL and is not
-- affected by these revokes.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke usage on schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ===========================================================================
-- 2. employees no longer hangs off auth.users
-- ===========================================================================
alter table public.employees drop constraint if exists employees_id_fkey;
alter table public.employees alter column id set default gen_random_uuid();

-- The sign-up trigger lived on auth.users, which we no longer write to.
drop trigger  if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- ===========================================================================
-- 3. Keep the domain rule enforced in the database
-- ===========================================================================
-- The README promises the domain restriction is enforced twice — in the app and
-- again in the database, so a forged sign-in still cannot create an account.
-- The trigger that did it was bound to auth.users, so re-bind it to employees.
create or replace function public.enforce_employee_domain()
returns trigger language plpgsql set search_path = public as $$
declare
  allowed text := public.setting('allowed_email_domain');
begin
  if allowed is not null
     and lower(split_part(new.email, '@', 2)) <> lower(allowed) then
    raise exception 'Sign-in is limited to % addresses.', allowed
      using errcode = 'check_violation';
  end if;
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists employees_domain_check on public.employees;
create trigger employees_domain_check
  before insert or update of email on public.employees
  for each row execute function public.enforce_employee_domain();

-- ===========================================================================
-- 4. Row-level security off, policies dropped
-- ===========================================================================
-- Left enabled-but-policyless this would read as "secured" while the owning
-- role silently bypassed it. Make the new posture explicit instead.
drop policy if exists employees_select_own            on public.employees;
drop policy if exists employees_update_own            on public.employees;
drop policy if exists jobs_select_open                on public.jobs;
drop policy if exists candidates_select_own_referrals on public.candidates;
drop policy if exists referrals_select_own            on public.referrals;
drop policy if exists referral_stages_select_own      on public.referral_stages;

alter table public.app_settings    disable row level security;
alter table public.employees       disable row level security;
alter table public.jobs            disable row level security;
alter table public.candidates      disable row level security;
alter table public.referrals       disable row level security;
alter table public.referral_stages disable row level security;

-- ===========================================================================
-- 5. submit_referral takes the referrer explicitly
-- ===========================================================================
-- It no longer needs SECURITY DEFINER: the caller is the owning role. It stays
-- a function because the duplicate check, the candidate insert, the snapshot and
-- the first stage row must remain one transaction.
--
-- The caller is now trusted to pass a correct p_referrer_id. That is the whole
-- trade of app-level permissions: this function can no longer tell you who is
-- calling it, so the application must never pass anything but the signed-in
-- employee's id.
drop function if exists public.submit_referral(uuid, text, text, text, text, text, text, text, text);

create or replace function public.submit_referral(
  p_referrer_id   uuid,
  p_job_id        uuid,
  p_full_name     text,
  p_email         text,
  p_phone         text,
  p_org           text,
  p_designation   text,
  p_linkedin      text,
  p_relationship  text,
  p_consent_text  text
)
returns table (ref_code text, reward_amount integer)
language plpgsql set search_path = public as $$
declare
  v_job       public.jobs%rowtype;
  v_email     text;
  v_phone     text;
  v_months    text;
  v_window    interval;
  v_candidate uuid;
  v_code      text;
begin
  if p_referrer_id is null then
    raise exception 'You must be signed in to refer someone.' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.employees where id = p_referrer_id) then
    raise exception 'Your employee record is not set up yet. Sign out and in again.' using errcode = 'no_data_found';
  end if;

  select * into v_job from public.jobs where id = p_job_id and is_open;
  if not found then
    raise exception 'That role is no longer open for referrals.' using errcode = 'check_violation';
  end if;

  if coalesce(trim(p_consent_text), '') = '' then
    raise exception 'The candidate consent notice is missing.' using errcode = 'check_violation';
  end if;

  v_email := public.normalise_email(p_email);
  v_phone := public.normalise_phone(p_phone);

  -- A missing setting used to make the window NULL, which silently disabled the
  -- duplicate check entirely. Fail loudly instead.
  v_months := public.setting('referral_validity_months');
  if v_months is null then
    raise exception 'Programme setting referral_validity_months is missing.' using errcode = 'check_violation';
  end if;
  v_window := (v_months || ' months')::interval;

  -- Serialise submissions for this candidate. Without this the check below and
  -- the insert that follows are not atomic: two referrers submitting the same
  -- person at the same moment both see "no duplicate" and both succeed, which is
  -- exactly the dispute the one-referral-per-candidate rule exists to prevent.
  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_phone, 0));

  if exists (
    select 1
    from public.referrals r
    join public.candidates c on c.id = r.candidate_id
    where r.submitted_at > now() - v_window
      and (c.email_normalised = v_email or c.phone_e164 = v_phone)
  ) then
    raise exception 'This candidate is already in process. The first referral on record holds.'
      using errcode = 'unique_violation';
  end if;

  insert into public.candidates
    (full_name, email_normalised, phone_e164, current_org, current_designation, linkedin_url)
  values
    (trim(p_full_name), v_email, v_phone, nullif(trim(p_org), ''),
     nullif(trim(p_designation), ''), nullif(trim(p_linkedin), ''))
  returning id into v_candidate;

  -- REF- plus 8 hex characters. The previous 4-digit form had 9,000 possible
  -- values, so the retry loop degraded as the table filled and could not
  -- terminate at all once they were exhausted.
  --
  -- md5() and random() are built in. gen_random_bytes() would read better but
  -- lives in pgcrypto, which Supabase installs into the extensions schema — it
  -- would not resolve under this function's search_path.
  loop
    v_code := 'REF-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.referrals where referrals.ref_code = v_code);
  end loop;

  insert into public.referrals
    (ref_code, referrer_id, candidate_id, job_id, relationship, valid_until,
     reward_amount_snapshot, eligibility_days_snapshot, consent_text)
  values
    (v_code, p_referrer_id, v_candidate, v_job.id, p_relationship, now() + v_window,
     v_job.reward_amount, v_job.eligibility_days, trim(p_consent_text));

  insert into public.referral_stages (referral_id, stage)
  select id, 'Referral submitted' from public.referrals where referrals.ref_code = v_code;

  return query select v_code, v_job.reward_amount;
end;
$$;

commit;
