-- Keka integration: external identity, sync bookkeeping and stage mapping.
--
-- Run after 0001_schema.sql and 0002_seed.sql. Idempotent, like the others.
--
-- Three ideas carry this file:
--
--   1. Keka is the source of truth for job *facts* (title, department, status);
--      the Hub is the source of truth for job *programme config* (reward,
--      eligibility, priority). CONTEXT.md convention 4. The sync must never
--      overwrite the second set, or an hourly job quietly resets rewards HR
--      configured by hand.
--
--   2. Configuration lives in data (convention 2). Keka returns a
--      jobHiringStageId GUID and no endpoint enumerates stage names, so the
--      mapping from that GUID to employee-facing wording is a table we fill by
--      observation, not a constant in code.
--
--   3. Silence must mean healthy (convention 10). Every sync run is recorded,
--      so "nothing has changed" and "the sync has been broken for two days"
--      cannot look the same.

begin;

-- An earlier revision of this file shipped a one-row-per-call upsert. It was
-- replaced by the batch version below; drop it so both do not linger.
drop function if exists upsert_keka_job(text, text, text, text, text, text, boolean, text, date);
drop function if exists upsert_keka_job(text, text, text, text, text, text, text, date, integer, boolean);

-- ---------------------------------------------------------------- settings
insert into app_settings (key, value, description) values
  ('keka_default_reward_amount',    '10000',
   'Reward applied to a role newly discovered in Keka, until HR sets a real one.'),
  ('keka_default_eligibility_days', '30',
   'Eligibility window applied to a newly discovered role, until HR sets a real one.'),
  ('keka_open_job_statuses',        '1',
   'Comma-separated Keka JobStatus values that mean the role is open. Keka '
   'publishes no enum for this; set it from what scripts/keka-discover.mjs '
   'reports for your tenant. Anything not listed is treated as closed.'),
  ('keka_push_candidates',          'false',
   'When true, a submitted referral is pushed to Keka Hire as a candidate. Off until the tenant field mapping is confirmed.')
on conflict (key) do nothing;

-- -------------------------------------------------------------------- jobs
-- Roles arriving from Keka keep their Keka identity, so the sync can upsert
-- rather than duplicate. Seeded roles have a null keka_job_id and are left
-- alone by the sync.
alter table jobs add column if not exists keka_job_id    text;
alter table jobs add column if not exists source         text not null default 'seed';
alter table jobs add column if not exists last_synced_at timestamptz;

-- The raw Keka facts, stored rather than only consumed. `is_open` is derived
-- from these plus keka_open_job_statuses, so when someone works out which
-- status values actually mean "open", rederive_keka_job_openness() applies the
-- new answer in one statement instead of forcing a 906-job re-sync.
alter table jobs add column if not exists keka_status           integer;
alter table jobs add column if not exists keka_referral_enabled boolean;

-- Whether the reward on this role is a real, HR-set figure or the placeholder
-- a newly discovered Keka role is given.
--
-- CONTEXT.md convention 1 and the whole point of the "Sample data" markers:
-- a number an employee might act on must never be invented and shown as real.
-- 364 Keka roles all displaying the same default reward would be exactly that
-- failure, so the UI shows "Reward to be confirmed" until this is true.
alter table jobs add column if not exists reward_confirmed boolean not null default false;

-- Keka's own requisition code, e.g. "CGJOB764". Kept raw and separate because
-- it is NOT unique — 906 tenant jobs use 905 distinct values — while
-- jobs.req_id is declared unique back in 0001. req_id therefore gets a
-- disambiguated copy and this column keeps the truth.
alter table jobs add column if not exists keka_org_job_id text;

-- The ten seeded roles carry rewards taken from the real programme.
update jobs set reward_confirmed = true where source = 'seed' and not reward_confirmed;

-- A partial unique index rather than a unique constraint: the ten seeded roles
-- all have a null keka_job_id and must not collide with each other.
create unique index if not exists jobs_keka_id_idx
  on jobs (keka_job_id) where keka_job_id is not null;

comment on column jobs.source is
  'seed | keka. Rows with source=keka are overwritten by the sync on the '
  'Keka-owned columns only (title, department, location, experience_band, '
  'is_open, summary, posted_on). reward_amount, eligibility_days and '
  'is_priority stay Hub-owned and are never touched by a sync.';

-- --------------------------------------------------------------- referrals
-- The link back to the candidate record the Hub created in Keka Hire.
-- Nullable throughout: a referral is valid and complete without ever reaching
-- Keka. The push is an enrichment, never a precondition.
alter table referrals add column if not exists keka_candidate_id text;
alter table referrals add column if not exists keka_pushed_at    timestamptz;
alter table referrals add column if not exists keka_push_error   text;
alter table referrals add column if not exists keka_push_attempts integer not null default 0;

create index if not exists referrals_keka_pending_idx
  on referrals (submitted_at)
  where keka_candidate_id is null;

create unique index if not exists referrals_keka_candidate_idx
  on referrals (keka_candidate_id) where keka_candidate_id is not null;

-- ------------------------------------------------------------- stage map
-- Keka returns jobHiringStageId as an opaque identifier and publishes no
-- endpoint that lists the stages. scripts/keka-discover.mjs collects the
-- distinct ids seen in a tenant; a human then fills in the wording.
--
-- Until a row exists here, a stage is UNMAPPED: the sync records it but shows
-- the employee nothing. Inventing a label for an unknown recruitment stage is
-- exactly the failure commitment 1 and convention 1 exist to prevent.
create table if not exists keka_stage_map (
  keka_stage_id    text primary key,
  keka_stage_name  text,
  -- What the employee reads. Null means "do not show this stage at all".
  employee_wording text,
  -- Some stages are deliberately silent: an internal screening rejection is
  -- not something the referrer is told in the moment.
  is_visible       boolean not null default false,
  notifies         boolean not null default false,
  sort_order       integer not null default 100,
  first_seen_at    timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table keka_stage_map is
  'ATS stage id to employee-facing wording. Unmapped stages are stored but '
  'never shown. Populate with scripts/keka-discover.mjs, then edit by hand.';

-- ------------------------------------------------------------- sync runs
-- Convention 10: silence must mean healthy. One row per run, always written,
-- including on failure.
create table if not exists integration_sync_runs (
  id            uuid primary key default gen_random_uuid(),
  integration   text not null,              -- 'keka'
  resource      text not null,              -- 'jobs' | 'candidates' | 'employees'
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running',   -- running | ok | failed
  -- The high-water mark this run read from, and the one it will hand to the
  -- next run. Kept per run so a bad watermark can be traced and rolled back.
  watermark_in  timestamptz,
  watermark_out timestamptz,
  records_read    integer not null default 0,
  records_written integer not null default 0,
  error         text
);

create index if not exists sync_runs_recent_idx
  on integration_sync_runs (integration, resource, started_at desc);

-- The watermark a new run should start from: the last run that actually
-- succeeded. A failed run must not advance it, or the records it missed are
-- skipped forever.
create or replace function last_sync_watermark(p_integration text, p_resource text)
returns timestamptz language sql stable as $$
  select watermark_out
    from integration_sync_runs
   where integration = p_integration
     and resource    = p_resource
     and status      = 'ok'
     and watermark_out is not null
   order by started_at desc
   limit 1;
$$;

-- Is this Keka status one of the values configured as "open"?
create or replace function keka_status_is_open(p_status integer)
returns boolean language sql stable as $$
  select p_status is not null
     and p_status = any (
       string_to_array(coalesce(setting('keka_open_job_statuses'), '1'), ',')::integer[]
     );
$$;

-- ------------------------------------------------------- upsert the jobs
-- Takes the whole page as JSON and loops inside the database.
--
-- The first version of this did one round trip per job. Against Neon in
-- Virginia, with every user and this machine in India, §4's ~250ms per query
-- turned 906 jobs into roughly four minutes — past the route's 300s ceiling.
-- One call does it in one round trip.
--
-- What it deliberately does NOT write on conflict: reward_amount,
-- eligibility_days, is_priority, reward_confirmed, req_id. Those are Hub-owned
-- programme config (CONTEXT.md conventions 2 and 4). Do not add them.
create or replace function upsert_keka_jobs(p_jobs jsonb)
returns table (written integer, opened integer, closed integer)
language plpgsql as $$
declare
  v_reward  integer := coalesce(setting('keka_default_reward_amount')::integer, 10000);
  v_days    integer := coalesce(setting('keka_default_eligibility_days')::integer, 30);
  v_written integer := 0;
  v_opened  integer := 0;
  v_closed  integer := 0;
  v_req     text;
  v_open    boolean;
  r         record;
begin
  for r in
    select * from jsonb_to_recordset(p_jobs) as x(
      keka_job_id      text,
      org_job_id       text,
      title            text,
      department       text,
      location         text,
      experience_band  text,
      summary          text,
      posted_on        date,
      keka_status      integer,
      referral_enabled boolean
    )
  loop
    if coalesce(trim(r.keka_job_id), '') = '' then
      continue;
    end if;

    v_open := keka_status_is_open(r.keka_status)
              and coalesce(r.referral_enabled, false);

    -- jobs.req_id is unique (0001) but Keka's orgJobId is not, so a bare copy
    -- fails the constraint on the one tenant value that repeats. Take the
    -- readable code when it is free and disambiguate with the Keka id when it
    -- is not. req_id is never updated on conflict, so whichever row claimed
    -- the bare code keeps it and re-syncs stay stable.
    v_req := coalesce(nullif(trim(r.org_job_id), ''), 'KEKA-' || left(r.keka_job_id, 8));
    if exists (
      select 1 from jobs j
       where j.req_id = v_req
         and j.keka_job_id is distinct from r.keka_job_id
    ) then
      v_req := v_req || '-' || left(r.keka_job_id, 8);
    end if;

    insert into jobs (
      keka_job_id, keka_org_job_id, source, req_id, title, department, location,
      experience_band, is_open, summary, posted_on, reward_amount,
      eligibility_days, last_synced_at, keka_status, keka_referral_enabled,
      reward_confirmed
    )
    values (
      r.keka_job_id,
      nullif(trim(r.org_job_id), ''),
      'keka',
      v_req,
      coalesce(nullif(trim(r.title), ''), 'Untitled role'),
      coalesce(nullif(trim(r.department), ''), 'Unspecified'),
      coalesce(nullif(trim(r.location), ''), 'Unspecified'),
      coalesce(nullif(trim(r.experience_band), ''), 'Not specified'),
      v_open,
      nullif(trim(r.summary), ''),
      coalesce(r.posted_on, current_date),
      v_reward,
      v_days,
      now(),
      r.keka_status,
      r.referral_enabled,
      false   -- placeholder reward until HR sets a real one
    )
    on conflict (keka_job_id) where keka_job_id is not null
    do update set
      keka_org_job_id       = excluded.keka_org_job_id,
      title                 = excluded.title,
      department            = excluded.department,
      location              = excluded.location,
      experience_band       = excluded.experience_band,
      is_open               = excluded.is_open,
      summary               = excluded.summary,
      posted_on             = excluded.posted_on,
      keka_status           = excluded.keka_status,
      keka_referral_enabled = excluded.keka_referral_enabled,
      last_synced_at        = now();

    v_written := v_written + 1;
    if v_open then v_opened := v_opened + 1; else v_closed := v_closed + 1; end if;
  end loop;

  return query select v_written, v_opened, v_closed;
end;
$$;

-- Re-apply keka_open_job_statuses to every already-synced role.
--
-- Which Keka status integers mean "open" is a tenant fact nobody had confirmed
-- when the sync was written. Run this after changing the setting and the new
-- answer takes effect immediately, with no re-sync and no API calls.
create or replace function rederive_keka_job_openness()
returns table (opened integer, closed integer) language plpgsql as $$
declare
  v_opened integer;
  v_closed integer;
begin
  with updated as (
    update jobs
       set is_open = keka_status_is_open(keka_status)
                     and coalesce(keka_referral_enabled, false)
     where source = 'keka'
     returning is_open
  )
  select count(*) filter (where is_open),
         count(*) filter (where not is_open)
    into v_opened, v_closed
    from updated;

  return query select v_opened, v_closed;
end;
$$;

-- ---------------------------------------------------------------- grants
-- 0002/0003 of the Supabase era taught this: `create or replace function`
-- re-grants EXECUTE to PUBLIC, so the revoke has to come after the last
-- create, never before. CONTEXT.md §8.
revoke execute on function upsert_keka_jobs(jsonb) from public;
revoke execute on function last_sync_watermark(text, text) from public;
revoke execute on function keka_status_is_open(integer) from public;
revoke execute on function rederive_keka_job_openness() from public;

commit;
