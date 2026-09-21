-- Stage mapping seeded from the live tenant, plus the first multi-role feature.
--
-- Run after 0003. Idempotent.

begin;

-- ------------------------------------------------------------ stage map
-- Seeded from what Convegenius.keka.com actually returns (21 Sep 2026):
-- `Sourced` and `Shortlisted` across 502 candidates on six referral-enabled
-- jobs. The later stages are listed too, so that a candidate reaching one is
-- rendered rather than silently dropped; sort_order gives the timeline its
-- shape before anyone has reached the end of it.
--
-- The wording here is a faithful translation of a stage that genuinely
-- happened, NOT an invention like src/lib/showcase.ts. That distinction is the
-- whole of convention 1. It is still provisional until D15 settles exactly
-- what a referrer may see — which is one UPDATE away, because this is data.
insert into keka_stage_map
  (keka_stage_id, keka_stage_name, employee_wording, is_visible, notifies, sort_order)
values
  ('Sourced',      'Sourced',      'Referral received',     true,  false, 10),
  ('Shortlisted',  'Shortlisted',  'Profile shortlisted',   true,  true,  20),
  ('Screening',    'Screening',    'Profile under review',  true,  false, 15),
  ('Interview',    'Interview',    'Interviewing',          true,  true,  30),
  ('Offer',        'Offer',        'Offer stage',           true,  true,  40),
  ('Hired',        'Hired',        'Joined',                true,  true,  50),
  ('Joined',       'Joined',       'Joined',                true,  true,  50),
  -- Deliberately silent. Commitment 2: rejection reasoning and interview
  -- feedback stay in the ATS. The referrer is told the referral closed, not
  -- why, and never in a notification.
  ('Rejected',     'Rejected',     'No longer in process',  true,  false, 60),
  ('Archived',     'Archived',     'No longer in process',  true,  false, 60)
on conflict (keka_stage_id) do nothing;

-- --------------------------------------------------------------- admin
-- CONTEXT.md §6 requires this to be a deliberate choice rather than a drift:
-- authorisation for the first multi-role feature stays in the **server
-- layer**, consistent with everything since the Auth.js migration. RLS is not
-- reintroduced here, because a half-and-half state is worse than either.
--
-- That means every admin route must call requireAdmin() in src/lib/admin.ts,
-- and there is no safety net underneath it. scripts/e2e-admin.mjs exists to
-- catch its absence.
alter table employees add column if not exists is_admin boolean not null default false;

insert into app_settings (key, value, description) values
  ('admin_emails', '',
   'Comma-separated work addresses granted admin regardless of employees.is_admin. '
   'The bootstrap route in, so a database with no admin is never locked out.')
on conflict (key) do nothing;

create or replace function is_admin_email(p_email text)
returns boolean language sql stable as $$
  select exists (
    select 1
      from employees e
     where lower(e.email) = lower(trim(p_email))
       and e.is_admin
  )
  or exists (
    select 1
      from unnest(string_to_array(coalesce(setting('admin_emails'), ''), ',')) a(addr)
     where lower(trim(a.addr)) = lower(trim(p_email))
       and trim(a.addr) <> ''
  );
$$;

-- ------------------------------------------------------- referral status
-- The employee-facing status on a referral, kept in step with the latest
-- mapped stage. referral_stages remains the append-only record; this is the
-- denormalised "where are they now" the list screen reads.
alter table referrals add column if not exists current_stage    text;
alter table referrals add column if not exists current_stage_at timestamptz;
alter table referrals add column if not exists keka_last_seen_at timestamptz;

-- --------------------------------------------------- record a stage move
-- Append-only and idempotent. The sync runs hourly and re-reads the same
-- candidates, so appending must be safe to attempt repeatedly.
--
-- The idempotency key is (referral_id, stage, occurred_at), NOT "is this the
-- same as the most recent stage". The first version compared against the row
-- with the latest occurred_at, which broke the moment Keka's stage date was
-- older than the Hub's own "Referral submitted" timestamp — a candidate
-- already in Keka before being referred. The comparison never matched and the
-- timeline grew a duplicate every hour. scripts/e2e-stages.mjs caught it.
create unique index if not exists referral_stages_unique_idx
  on referral_stages (referral_id, stage, occurred_at);

create or replace function record_referral_stage(
  p_referral_id uuid,
  p_stage       text,
  p_occurred_at timestamptz,
  p_source      text default 'keka'
)
returns boolean language plpgsql as $$
declare
  v_at      timestamptz := coalesce(p_occurred_at, now());
  v_wording text;
  v_visible boolean;
  v_current timestamptz;
  v_added   boolean := false;
begin
  if coalesce(trim(p_stage), '') = '' then
    return false;
  end if;

  -- An unmapped stage is parked for a human before anything else, so that a
  -- stage we do not recognise still shows up on the admin screen even if
  -- nothing below it changes.
  insert into keka_stage_map (keka_stage_id, keka_stage_name, is_visible)
  values (p_stage, p_stage, false)
  on conflict (keka_stage_id) do nothing;

  insert into referral_stages (referral_id, stage, occurred_at, source)
  values (p_referral_id, p_stage, v_at, p_source)
  on conflict (referral_id, stage, occurred_at) do nothing;

  get diagnostics v_added = row_count;
  if not v_added then
    return false;   -- already recorded; nothing moved
  end if;

  select employee_wording, is_visible
    into v_wording, v_visible
    from keka_stage_map
   where keka_stage_id = p_stage;

  -- Only a mapped, visible stage becomes what the employee reads. The Hub
  -- does not invent wording for a stage it does not recognise.
  if not coalesce(v_visible, false) or v_wording is null then
    return true;
  end if;

  -- And only if it is genuinely the newest thing that has happened. Keka can
  -- report an older stage after a newer one; that must not rewind the status.
  select current_stage_at into v_current from referrals where id = p_referral_id;

  if v_current is null or v_at >= v_current then
    update referrals
       set current_stage    = v_wording,
           current_stage_at = v_at
     where id = p_referral_id;
  end if;

  return true;
end;
$$;

-- ------------------------------------------- match Keka candidates to us
-- One call for a whole page of candidates, for the same latency reason
-- db/0003 batches the job upsert.
--
-- Matching is by **normalised email**, not by a Keka candidate id: the Hub
-- does not push candidates yet, and even once it does, a candidate applying
-- directly and later being referred must still line up. normalise_email is
-- the same function submit_referral used when the referral was taken, so the
-- two sides agree by construction.
create or replace function apply_keka_candidate_stages(p_rows jsonb)
returns table (matched integer, advanced integer)
language plpgsql as $$
declare
  r          record;
  v_matched  integer := 0;
  v_advanced integer := 0;
  v_ref      uuid;
begin
  for r in
    select * from jsonb_to_recordset(p_rows) as x(
      keka_job_id       text,
      email             text,
      keka_candidate_id text,
      stage             text,
      occurred_at       timestamptz
    )
  loop
    if coalesce(trim(r.email), '') = '' then
      continue;
    end if;

    -- Scoped to the job as well as the person: the same candidate referred
    -- for two roles is two referrals with two independent journeys.
    select rf.id into v_ref
      from referrals rf
      join candidates c on c.id = rf.candidate_id
      join jobs       j on j.id = rf.job_id
     where j.keka_job_id = r.keka_job_id
       and c.email_normalised = normalise_email(r.email)
     order by rf.submitted_at desc
     limit 1;

    if v_ref is null then
      continue;   -- a Keka candidate nobody here referred. Not our business.
    end if;

    v_matched := v_matched + 1;

    update referrals set keka_last_seen_at = now() where id = v_ref;

    -- Remember the Keka id when we learn it, but never let a collision on the
    -- unique index abort the whole batch.
    if r.keka_candidate_id is not null then
      begin
        update referrals
           set keka_candidate_id = r.keka_candidate_id
         where id = v_ref and keka_candidate_id is null;
      exception when unique_violation then
        null;
      end;
    end if;

    if record_referral_stage(v_ref, r.stage, r.occurred_at, 'keka') then
      v_advanced := v_advanced + 1;
    end if;
  end loop;

  return query select v_matched, v_advanced;
end;
$$;

revoke execute on function apply_keka_candidate_stages(jsonb) from public;
revoke execute on function is_admin_email(text) from public;
revoke execute on function record_referral_stage(uuid, text, timestamptz, text) from public;

commit;
