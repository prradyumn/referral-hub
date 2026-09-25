-- Referrals made in Keka, brought into the Hub.
--
-- Until now the sync went one way: a referral made in the Hub was tracked
-- through Keka. A referral made *in Keka* never appeared here, so the
-- employee who made it saw nothing, and was never credited.
--
-- The hard part is not reading Keka — the key already reads candidates. It
-- is knowing who referred. Keka's candidate record has no referrer field: only
-- sourceTitle ("Employee Referral") and sourcedBy, a free-text string, present
-- on about a third of referrals (§22). A reward follows from this, so:
--
--   · a referrer is credited automatically ONLY from one specific Keka field,
--     named in app_settings.keka_referrer_email_field, holding a work email.
--     Never from sourcedBy, which may be the recruiter who added the
--     candidate, and never from scanning every field for an address, which
--     would credit a hiring manager whose email sits in another one
--   · everything else waits here for an admin, with a suggestion at most
--
-- Payment stays a human act regardless: refresh_reward_states() never
-- approves anything (0007).
--
-- Re-runnable: apply-schema.mjs replays every file on each run.

begin;

-- ---------------------------------------------------------------- referrals
alter table referrals add column if not exists origin text not null default 'hub'
  check (origin in ('hub', 'keka'));

-- When the referral was actually made in Keka. submitted_at stays the moment
-- the Hub recorded it, because submit_referral's validity window and
-- duplicate check both run from it.
alter table referrals add column if not exists keka_applied_on timestamptz;

-- ---------------------------------------------------------- the staging list
-- Every Employee Referral candidate Keka showed us, and what was decided.
-- Candidates Keka did NOT mark as referrals are dropped before this table:
-- the Hub has no business holding people nobody here referred.
create table if not exists keka_referral_candidates (
  id                    uuid primary key default gen_random_uuid(),
  keka_job_id           text not null,
  keka_candidate_id     text not null,
  job_id                uuid references jobs (id) on delete set null,
  full_name             text not null,
  email_normalised      text,
  phone_e164            text,
  -- Keka's free-text sourcedBy, verbatim. A clue for a person, never a key.
  sourced_by            text,
  -- From the configured referrer field, when it holds a work email.
  referrer_email        text,
  -- The configured field's raw value when it is NOT a usable work email,
  -- e.g. a name typed where an address was asked for.
  referrer_hint         text,
  -- Names of the custom fields and screening questions Keka sent — never
  -- their values, which can include salary answers. Shown to an admin
  -- choosing which field holds the referrer's email.
  fields_seen           text[] not null default '{}',
  applied_on            timestamptz,
  status                text not null default 'needs_review' check (status in (
                          'needs_review', -- waiting for an admin
                          'credited',     -- a Hub referral was created
                          'in_hub',       -- the same referral already exists here
                          'duplicate',    -- someone else referred them first
                          'incomplete',   -- Keka lacks an email or a usable phone
                          'dismissed')),  -- an admin said this is not a referral
  reason                text,
  suggested_employee_id uuid references employees (id) on delete set null,
  referral_id           uuid references referrals (id) on delete set null,
  resolved_by           uuid references employees (id) on delete set null,
  resolved_at           timestamptz,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  unique (keka_job_id, keka_candidate_id)
);

create index if not exists keka_referral_candidates_open_idx
  on keka_referral_candidates (first_seen_at) where status = 'needs_review';

-- ------------------------------------------------------------------ settings
insert into app_settings (key, value, description) values
  ('keka_import_referrals', 'true',
   'true: the nightly sync brings referrals made in Keka into the Hub. '
   'false: it leaves them alone.'),
  ('keka_referrer_email_field', '',
   'The name of the Keka field holding the referrer''s work email, exactly as '
   'Keka sends it. Empty: nothing is credited automatically and every Keka '
   'referral waits for an admin.'),
  -- Today, not the start of time. A referral made in Keka before the Hub may
  -- already have been rewarded under the old process; importing it could pay
  -- it twice. Moving this earlier is HR's call — decision D18.
  ('keka_referral_import_since', to_char(current_date, 'YYYY-MM-DD'),
   'Only referrals made in Keka on or after this date (YYYY-MM-DD) are '
   'brought in. Earlier ones may already have been paid under the old process.')
on conflict (key) do nothing;

-- ------------------------------------------------------------------- intake
-- Upserts what the sync read, then settles anything that can be settled
-- without an admin. Returns the rows ready to credit automatically.
create or replace function upsert_keka_referral_candidates(p_rows jsonb)
-- Output names are prefixed: in PL/pgSQL they are variables in scope, and one
-- named referrer_email would clash with the column of the same name.
returns table (out_row_id uuid, out_referrer_email text)
language plpgsql set search_path = public as $$
begin
  insert into keka_referral_candidates as k
    (keka_job_id, keka_candidate_id, job_id, full_name, email_normalised, phone_e164,
     sourced_by, referrer_email, referrer_hint, fields_seen, applied_on,
     suggested_employee_id)
  select r->>'keka_job_id',
         r->>'keka_candidate_id',
         (select j.id from jobs j where j.keka_job_id = r->>'keka_job_id' limit 1),
         coalesce(nullif(trim(r->>'full_name'), ''), 'Unnamed candidate'),
         nullif(normalise_email(coalesce(r->>'email', '')), ''),
         -- Only a number the Hub's normaliser can make sense of. An empty one
         -- would normalise to '+', and every other '+' would then look like
         -- the same person to the duplicate check.
         case when normalise_phone(coalesce(r->>'phone', '')) ~ '^\+91[0-9]{10}$'
              then normalise_phone(r->>'phone') end,
         nullif(trim(r->>'sourced_by'), ''),
         nullif(lower(trim(r->>'referrer_email')), ''),
         nullif(trim(r->>'referrer_hint'), ''),
         coalesce(array(select jsonb_array_elements_text(r->'fields_seen')), '{}'),
         nullif(r->>'applied_on', '')::timestamptz,
         nullif(r->>'suggested_employee_id', '')::uuid
    from jsonb_array_elements(p_rows) r
  on conflict (keka_job_id, keka_candidate_id) do update set
    -- Keka's facts refresh on every run. A decision is never undone by one.
    full_name             = excluded.full_name,
    email_normalised      = excluded.email_normalised,
    phone_e164            = excluded.phone_e164,
    sourced_by            = excluded.sourced_by,
    referrer_email        = excluded.referrer_email,
    referrer_hint         = excluded.referrer_hint,
    fields_seen           = excluded.fields_seen,
    applied_on            = excluded.applied_on,
    job_id                = coalesce(excluded.job_id, k.job_id),
    suggested_employee_id = coalesce(excluded.suggested_employee_id, k.suggested_employee_id),
    last_seen_at          = now();

  -- Already a Hub referral: most often one TA copied into Keka from the inbox
  -- and tagged Employee Referral, exactly as the inbox asks. It is the same
  -- referral, not a new one.
  update keka_referral_candidates k
     set status = 'in_hub', referral_id = m.id, reason = null, resolved_at = now()
    from (
      select distinct on (k2.id) k2.id as staging_id, r.id
        from keka_referral_candidates k2
        join referrals  r on true
        join candidates c on c.id = r.candidate_id
       where k2.status in ('needs_review', 'incomplete')
         and (r.keka_candidate_id = k2.keka_candidate_id
              or (r.valid_until > now()
                  and (c.email_normalised = k2.email_normalised
                       or c.phone_e164 = k2.phone_e164)))
       order by k2.id, r.submitted_at
    ) m
   where k.id = m.staging_id;

  update keka_referral_candidates
     set status = 'incomplete',
         reason = case
           when job_id is null then 'The role is not in the Hub.'
           when email_normalised is null then 'Keka has no email for this candidate.'
           else 'Keka has no usable Indian mobile number for this candidate.'
         end
   where status = 'needs_review'
     and (job_id is null or email_normalised is null or phone_e164 is null);

  -- Fixed in Keka since the last run: back to the queue.
  update keka_referral_candidates
     set status = 'needs_review', reason = null
   where status = 'incomplete'
     and job_id is not null and email_normalised is not null and phone_e164 is not null;

  return query
    select k.id, k.referrer_email
      from keka_referral_candidates k
     where k.status = 'needs_review' and k.referrer_email is not null;
end;
$$;

-- ------------------------------------------------------------------- credit
-- Turns one staging row into a Hub referral credited to p_referrer_email.
-- Called by the sync for a configured-field match, and by an admin
-- confirming from the queue.
--
-- Goes through submit_referral, so the duplicate check, the normalisation,
-- the advisory locks and the reward snapshot are the same as for a referral
-- made in the Hub (§6: referrals are written through that function only).
create or replace function credit_keka_referral(
  p_row_id         uuid,
  p_referrer_email text,
  p_actor_id       uuid default null
)
returns text
language plpgsql set search_path = public as $$
declare
  k          keka_referral_candidates%rowtype;
  v_email    text := lower(trim(coalesce(p_referrer_email, '')));
  v_referrer uuid;
  v_code     text;
  v_referral uuid;
begin
  select * into k from keka_referral_candidates where id = p_row_id for update;
  if not found then
    raise exception 'No such Keka referral.' using errcode = 'no_data_found';
  end if;

  -- Settled already. Running twice must not create two referrals.
  if k.status in ('credited', 'in_hub', 'dismissed', 'duplicate') then
    return k.status;
  end if;

  if k.job_id is null or k.email_normalised is null or k.phone_e164 is null then
    return 'incomplete';
  end if;

  begin
    -- The referrer need not have signed in yet: the row is created, and it is
    -- theirs when they do, because sign-in matches on email. The domain
    -- trigger refuses anything outside the work domain.
    insert into employees (email) values (v_email) on conflict (email) do nothing;
    select id into v_referrer from employees where email = v_email;

    select s.ref_code into v_code
      from submit_referral(
             v_referrer, k.job_id, k.full_name, k.email_normalised, k.phone_e164,
             null, null, null,
             'Not recorded (referred in Keka)',
             -- Honest about what the Hub did not do. For a Keka referral, no
             -- consent notice was shown here; whatever Keka's process
             -- captured is the record. D14.
             'Referred in Keka Hire. The Referral Hub showed no consent notice for '
             || 'this referral; consent is whatever Keka''s process captured.'
           ) s;
  exception
    when unique_violation then
      update keka_referral_candidates
         set status = 'duplicate',
             reason = 'Someone else referred this person first, and that referral is still valid.',
             resolved_by = p_actor_id, resolved_at = now()
       where id = p_row_id;
      return 'duplicate';
    when check_violation then
      -- Not a work address, or the role has closed since.
      update keka_referral_candidates
         set reason = sqlerrm
       where id = p_row_id;
      return 'refused';
  end;

  update referrals
     set origin            = 'keka',
         -- Set, so the push sweeper (which picks keka_candidate_id is null)
         -- can never send this candidate back into Keka as a duplicate.
         keka_candidate_id = k.keka_candidate_id,
         -- Set, so the TA inbox does not ask anyone to add it to Keka.
         keka_last_seen_at = now(),
         keka_applied_on   = k.applied_on
   where ref_code = v_code
   returning id into v_referral;

  -- The journey starts when the referral was made, not when the Hub heard.
  if k.applied_on is not null then
    update referral_stages
       set occurred_at = k.applied_on
     where referral_id = v_referral and source = 'hub';
  end if;

  update keka_referral_candidates
     set status = 'credited', referral_id = v_referral, referrer_email = v_email,
         reason = null, resolved_by = p_actor_id, resolved_at = now()
   where id = p_row_id;

  return 'credited';
end;
$$;

-- Matches 0003: nothing reachable through the old API roles.
revoke execute on function upsert_keka_referral_candidates(jsonb) from public;
revoke execute on function credit_keka_referral(uuid, text, uuid) from public;

commit;
