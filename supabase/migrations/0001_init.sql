-- Referral Hub · Phase 0 schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- settings
-- Programme configuration lives in data, never in application code.
create table if not exists public.app_settings (
  key         text primary key,
  value       text not null,
  description text
);

insert into public.app_settings (key, value, description) values
  ('allowed_email_domain',      'convegenius.ai', 'Only addresses on this domain may sign in.'),
  ('referral_validity_months',  '6',              'How long a referral blocks a re-referral of the same candidate.')
on conflict (key) do nothing;

create or replace function public.setting(p_key text)
returns text language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key;
$$;

-- --------------------------------------------------------------- employees
create table if not exists public.employees (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text,
  department  text,
  location    text,
  created_at  timestamptz not null default now()
);

-- Phase 1 replaces this with the HRMS sync. For now the row is created on
-- first sign-in, and the domain rule is enforced here as well as in the app.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allowed text := public.setting('allowed_email_domain');
begin
  if allowed is not null and lower(split_part(new.email, '@', 2)) <> lower(allowed) then
    raise exception 'Sign-in is limited to % addresses.', allowed
      using errcode = 'check_violation';
  end if;

  insert into public.employees (id, email, full_name)
  values (new.id, lower(new.email), nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------------- jobs
create table if not exists public.jobs (
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

create index if not exists jobs_open_idx on public.jobs (is_open, is_priority desc, posted_on desc);

-- -------------------------------------------------------------- candidates
create table if not exists public.candidates (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  email_normalised    text not null,
  phone_e164          text not null,
  current_org         text,
  current_designation text,
  linkedin_url        text,
  created_at          timestamptz not null default now()
);

create index if not exists candidates_email_idx on public.candidates (email_normalised);
create index if not exists candidates_phone_idx on public.candidates (phone_e164);

-- --------------------------------------------------------------- referrals
create table if not exists public.referrals (
  id                        uuid primary key default gen_random_uuid(),
  ref_code                  text not null unique,
  referrer_id               uuid not null references public.employees (id) on delete restrict,
  candidate_id              uuid not null references public.candidates (id) on delete restrict,
  job_id                    uuid not null references public.jobs (id) on delete restrict,
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

create index if not exists referrals_referrer_idx on public.referrals (referrer_id, submitted_at desc);

-- Append-only stage history. Phase 1 writes to this from the ATS sync.
create table if not exists public.referral_stages (
  id           uuid primary key default gen_random_uuid(),
  referral_id  uuid not null references public.referrals (id) on delete cascade,
  stage        text not null,
  occurred_at  timestamptz not null default now(),
  source       text not null default 'hub'
);

create index if not exists referral_stages_referral_idx on public.referral_stages (referral_id, occurred_at);

-- ------------------------------------------------------------ row security
alter table public.app_settings    enable row level security;
alter table public.employees       enable row level security;
alter table public.jobs            enable row level security;
alter table public.candidates      enable row level security;
alter table public.referrals       enable row level security;
alter table public.referral_stages enable row level security;

drop policy if exists employees_select_own on public.employees;
create policy employees_select_own on public.employees
  for select to authenticated using (id = auth.uid());

drop policy if exists employees_update_own on public.employees;
create policy employees_update_own on public.employees
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists jobs_select_open on public.jobs;
create policy jobs_select_open on public.jobs
  for select to authenticated using (is_open);

-- A candidate is readable only through a referral this employee made.
drop policy if exists candidates_select_own_referrals on public.candidates;
create policy candidates_select_own_referrals on public.candidates
  for select to authenticated using (
    exists (
      select 1 from public.referrals r
      where r.candidate_id = candidates.id and r.referrer_id = auth.uid()
    )
  );

drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own on public.referrals
  for select to authenticated using (referrer_id = auth.uid());

drop policy if exists referral_stages_select_own on public.referral_stages;
create policy referral_stages_select_own on public.referral_stages
  for select to authenticated using (
    exists (
      select 1 from public.referrals r
      where r.id = referral_stages.referral_id and r.referrer_id = auth.uid()
    )
  );

-- No insert policy anywhere: referrals are created only through the function
-- below, so the duplicate check can never be skipped by writing directly.

-- ------------------------------------------------------- normalisation
create or replace function public.normalise_email(p_email text)
returns text language sql immutable as $$
  select lower(
    regexp_replace(trim(p_email), '\+[^@]*(?=@)', '', 'g')
  );
$$;

-- Indian mobile numbers, stored E.164.
create or replace function public.normalise_phone(p_phone text)
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
-- Returns the new referral's ref_code. Raises a clean error on a duplicate,
-- and never reveals who the earlier referrer was.
create or replace function public.submit_referral(
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
language plpgsql security definer set search_path = public as $$
declare
  v_employee   uuid := auth.uid();
  v_job        public.jobs%rowtype;
  v_email      text;
  v_phone      text;
  v_window     interval;
  v_candidate  uuid;
  v_code       text;
begin
  if v_employee is null then
    raise exception 'You must be signed in to refer someone.' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.employees where id = v_employee) then
    raise exception 'Your employee record is not set up yet. Sign out and in again.' using errcode = 'no_data_found';
  end if;

  select * into v_job from public.jobs where id = p_job_id and is_open;
  if not found then
    raise exception 'That role is no longer open for referrals.' using errcode = 'check_violation';
  end if;

  if coalesce(trim(p_consent_text), '') = '' then
    raise exception 'The candidate consent notice is missing.' using errcode = 'check_violation';
  end if;

  v_email  := public.normalise_email(p_email);
  v_phone  := public.normalise_phone(p_phone);
  v_window := (public.setting('referral_validity_months') || ' months')::interval;

  -- Duplicate check on normalised email or phone, inside the validity window.
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

  v_code := 'REF-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0');
  while exists (select 1 from public.referrals where referrals.ref_code = v_code) loop
    v_code := 'REF-' || lpad((floor(random() * 9000) + 1000)::text, 4, '0');
  end loop;

  insert into public.referrals
    (ref_code, referrer_id, candidate_id, job_id, relationship, valid_until,
     reward_amount_snapshot, eligibility_days_snapshot, consent_text)
  values
    (v_code, v_employee, v_candidate, v_job.id, p_relationship, now() + v_window,
     v_job.reward_amount, v_job.eligibility_days, trim(p_consent_text));

  insert into public.referral_stages (referral_id, stage)
  select id, 'Referral submitted' from public.referrals where referrals.ref_code = v_code;

  return query select v_code, v_job.reward_amount;
end;
$$;

revoke all on function public.submit_referral(uuid, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_referral(uuid, text, text, text, text, text, text, text, text) to authenticated;
