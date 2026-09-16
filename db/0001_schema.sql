-- Referral Hub — complete schema for a standard PostgreSQL 14+ database.
--
-- This replaces the former supabase/migrations/0001..0003 trio, which only made
-- sense against Supabase: it referenced the auth.users table and the anon and
-- authenticated API roles, none of which exist here. Authentication is handled
-- by the application (Auth.js + Google) and permissions are enforced in
-- application code, so this file contains no row-level security.
--
-- Run once on a new database:  psql "$DATABASE_URL" -f db/0001_schema.sql

begin;

-- ---------------------------------------------------------------- settings
-- Programme configuration lives in data, never in application code.
create table if not exists app_settings (
  key         text primary key,
  value       text not null,
  description text
);

insert into app_settings (key, value, description) values
  ('allowed_email_domain',     'convegenius.ai', 'Only addresses on this domain may sign in.'),
  ('referral_validity_months', '6',              'How long a referral blocks a re-referral of the same candidate.')
on conflict (key) do nothing;

create or replace function setting(p_key text)
returns text language sql stable as $$
  select value from app_settings where key = p_key;
$$;

-- --------------------------------------------------------------- employees
-- Created on first sign-in by currentEmployee(). Phase 1 replaces this with the
-- HRMS sync.
create table if not exists employees (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  full_name  text,
  department text,
  location   text,
  created_at timestamptz not null default now()
);

-- The domain rule is enforced in the app's signIn callback and again here, so a
-- bug in the application cannot create an out-of-domain employee.
create or replace function enforce_employee_domain()
returns trigger language plpgsql as $$
declare
  allowed text := setting('allowed_email_domain');
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

drop trigger if exists employees_domain_check on employees;
create trigger employees_domain_check
  before insert or update of email on employees
  for each row execute function enforce_employee_domain();

-- -------------------------------------------------------------------- jobs
create table if not exists jobs (
  id               uuid primary key default gen_random_uuid(),
  req_id           text not null unique,
  title            text not null,
  department       text not null,
  location         text not null,
  experience_band  text not null,
  is_priority      boolean not null default false,
  is_open          boolean not null default true,
  reward_amount    integer not null,
  eligibility_days integer not null default 30,
  summary          text,
  skills           text[] not null default '{}',
  posted_on        date not null default current_date
);

create index if not exists jobs_open_idx on jobs (is_open, is_priority desc, posted_on desc);

-- -------------------------------------------------------------- candidates
-- The PII boundary. Retention rules apply here first.
create table if not exists candidates (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  email_normalised    text not null,
  phone_e164          text not null,
  current_org         text,
  current_designation text,
  linkedin_url        text,
  created_at          timestamptz not null default now()
);

create index if not exists candidates_email_idx on candidates (email_normalised);
create index if not exists candidates_phone_idx on candidates (phone_e164);

-- --------------------------------------------------------------- referrals
create table if not exists referrals (
  id                        uuid primary key default gen_random_uuid(),
  ref_code                  text not null unique,
  referrer_id               uuid not null references employees  (id) on delete restrict,
  candidate_id              uuid not null references candidates (id) on delete restrict,
  job_id                    uuid not null references jobs       (id) on delete restrict,
  relationship              text not null,
  status                    text not null default 'submitted',
  submitted_at              timestamptz not null default now(),
  valid_until               timestamptz not null,
  -- The rate that applied at submission. A later revision never rewrites it.
  reward_amount_snapshot    integer not null,
  eligibility_days_snapshot integer not null,
  -- DPDP: the notice shown and the moment it was accepted.
  consent_text              text not null,
  consent_at                timestamptz not null default now()
);

create index if not exists referrals_referrer_idx on referrals (referrer_id, submitted_at desc);

-- Append-only stage history. Phase 1 writes to this from the ATS sync.
create table if not exists referral_stages (
  id          uuid primary key default gen_random_uuid(),
  referral_id uuid not null references referrals (id) on delete cascade,
  stage       text not null,
  occurred_at timestamptz not null default now(),
  source      text not null default 'hub'
);

create index if not exists referral_stages_referral_idx on referral_stages (referral_id, occurred_at);

-- ----------------------------------------------------------- normalisation
create or replace function normalise_email(p_email text)
returns text language sql immutable as $$
  select lower(regexp_replace(trim(p_email), '\+[^@]*(?=@)', '', 'g'));
$$;

-- Indian mobile numbers, stored E.164.
create or replace function normalise_phone(p_phone text)
returns text language plpgsql immutable as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(digits) = 10 then
    return '+91' || digits;
  elsif length(digits) = 12 and left(digits, 2) = '91' then
    return '+' || digits;
  elsif length(digits) = 11 and left(digits, 1) = '0' then
    return '+91' || right(digits, 10);
  end if;
  return '+' || digits;
end;
$$;

-- ------------------------------------------------------- submit a referral
-- The only way a referral is created. The duplicate check, the candidate row,
-- the snapshot and the first stage row must all land in one transaction.
--
-- The caller passes p_referrer_id and is trusted to pass the signed-in
-- employee's id and nothing else. That is the trade of application-level
-- permissions: this function cannot tell who is calling it.
create or replace function submit_referral(
  p_referrer_id  uuid,
  p_job_id       uuid,
  p_full_name    text,
  p_email        text,
  p_phone        text,
  p_org          text,
  p_designation  text,
  p_linkedin     text,
  p_relationship text,
  p_consent_text text
)
returns table (ref_code text, reward_amount integer)
language plpgsql as $$
declare
  v_job       jobs%rowtype;
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

  if not exists (select 1 from employees where id = p_referrer_id) then
    raise exception 'Your employee record is not set up yet. Sign out and in again.' using errcode = 'no_data_found';
  end if;

  select * into v_job from jobs where id = p_job_id and is_open;
  if not found then
    raise exception 'That role is no longer open for referrals.' using errcode = 'check_violation';
  end if;

  if coalesce(trim(p_consent_text), '') = '' then
    raise exception 'The candidate consent notice is missing.' using errcode = 'check_violation';
  end if;

  v_email := normalise_email(p_email);
  v_phone := normalise_phone(p_phone);

  -- A missing setting would make the window NULL, which silently disables the
  -- duplicate check. Fail loudly instead.
  v_months := setting('referral_validity_months');
  if v_months is null then
    raise exception 'Programme setting referral_validity_months is missing.' using errcode = 'check_violation';
  end if;
  v_window := (v_months || ' months')::interval;

  -- Serialise submissions for this candidate. Without this the check below and
  -- the insert that follows are not atomic: two referrers submitting the same
  -- person at the same moment both see "no duplicate" and both succeed.
  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_phone, 0));

  if exists (
    select 1
      from referrals r
      join candidates c on c.id = r.candidate_id
     where r.submitted_at > now() - v_window
       and (c.email_normalised = v_email or c.phone_e164 = v_phone)
  ) then
    raise exception 'This candidate is already in process. The first referral on record holds.'
      using errcode = 'unique_violation';
  end if;

  insert into candidates
    (full_name, email_normalised, phone_e164, current_org, current_designation, linkedin_url)
  values
    (trim(p_full_name), v_email, v_phone, nullif(trim(p_org), ''),
     nullif(trim(p_designation), ''), nullif(trim(p_linkedin), ''))
  returning id into v_candidate;

  -- REF- plus 8 hex characters. md5() and random() are built in, so this needs
  -- no extension.
  loop
    v_code := 'REF-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from referrals where referrals.ref_code = v_code);
  end loop;

  insert into referrals
    (ref_code, referrer_id, candidate_id, job_id, relationship, valid_until,
     reward_amount_snapshot, eligibility_days_snapshot, consent_text)
  values
    (v_code, p_referrer_id, v_candidate, v_job.id, p_relationship, now() + v_window,
     v_job.reward_amount, v_job.eligibility_days, trim(p_consent_text));

  insert into referral_stages (referral_id, stage)
  select id, 'Referral submitted' from referrals where referrals.ref_code = v_code;

  return query select v_code, v_job.reward_amount;
end;
$$;

commit;
