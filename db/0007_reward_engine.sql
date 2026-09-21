-- The reward ledger: the part of this product Keka does not do.
--
-- Keka tracks recruitment. It has no concept of a referral reward, no
-- eligibility clock, and no record of what an employee is owed. That gap is
-- the reason the Hub exists (CONTEXT.md §1, commitment 3: "a promise made is
-- a promise kept").
--
-- Buildable today because the 21 Sep scan proved Keka reports the whole
-- pipeline through `Hired` with the recruitment scopes we already have. What
-- still needs HRIS and payroll, and is therefore deliberately absent:
--
--   · the true date of joining — the `Hired` stage date stands in for it
--   · whether the hire is still employed on day 30 — nothing checks this
--   · automatic payment — HR marks a reward paid by hand
--
-- All three are additive later. None of them block the ledger.

begin;

-- ------------------------------------------------------------ milestones
-- Config, not constants (convention 2). Adding an FY28 tier is data entry.
create table if not exists milestone_tiers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  threshold   integer not null,
  blurb       text,
  sort_order  integer not null default 100,
  is_active   boolean not null default true
);

insert into milestone_tiers (name, threshold, blurb, sort_order)
select * from (values
  ('Smartwatch',            1, 'Your first successful referral earns a smartwatch alongside the cash reward.', 10),
  ('Smartphone',            3, 'Three people you brought in, still with us past their first month.',           20),
  ('Harley ride experience',6, 'The one people talk about. Six joiners in a financial year.',                  30)
) as v(name, threshold, blurb, sort_order)
where not exists (select 1 from milestone_tiers);

-- D12 is unanswered: lifetime-cumulative or reset each financial year. Built
-- as lifetime because that is what the prototype's milestone track said, and
-- recorded here as a setting so the other answer is a config change and a
-- rewrite of one function rather than a migration.
insert into app_settings (key, value, description) values
  ('milestone_scope', 'lifetime',
   'lifetime | financial_year. D12 is unanswered; lifetime is the built default.')
on conflict (key) do nothing;

-- ---------------------------------------------------------- the ledger
-- One row per referral that actually resulted in a hire. Nothing is created
-- at referral time, because until somebody joins nothing is owed.
create table if not exists referral_rewards (
  id                uuid primary key default gen_random_uuid(),
  referral_id       uuid not null unique references referrals (id) on delete cascade,
  -- Copied from the referral, which copied it from the job at submission.
  -- Convention 3: a later revision never rewrites a promise already made.
  amount            integer not null,
  eligibility_days  integer not null,
  status            text not null default 'pending_joining',
  joined_at         timestamptz,
  eligible_from     date,
  approved_at       timestamptz,
  approved_by       uuid references employees (id),
  paid_at           timestamptz,
  paid_reference    text,
  forfeited_reason  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint referral_rewards_status_check check (status in
    ('pending_joining', 'eligible', 'approved', 'paid', 'forfeited'))
);

create index if not exists referral_rewards_status_idx
  on referral_rewards (status, eligible_from);

-- Append-only audit. Convention 1: state and audit commit together, in one
-- transaction, always — the prototype wrote audit rows for changes that never
-- happened, and this is the shape that makes that impossible.
create table if not exists reward_events (
  id          uuid primary key default gen_random_uuid(),
  reward_id   uuid not null references referral_rewards (id) on delete cascade,
  from_status text,
  to_status   text not null,
  actor       text,
  note        text,
  occurred_at timestamptz not null default now()
);

create index if not exists reward_events_reward_idx
  on reward_events (reward_id, occurred_at);

-- ------------------------------------------------------- joined marker
alter table referrals add column if not exists joined_at timestamptz;

-- Which Keka stages mean the candidate joined. Read from configuration so a
-- stage rename in Keka does not silently stop the reward engine.
create or replace function keka_stage_is_hired(p_stage text)
returns boolean language sql stable as $$
  select exists (
    select 1
      from unnest(string_to_array(coalesce(setting('keka_hired_stages'), 'Hired'), ',')) s(name)
     where lower(trim(s.name)) = lower(trim(p_stage))
  );
$$;

-- --------------------------------------------------- move a reward on
-- Every status change goes through here so that the state row and the audit
-- row cannot be written apart.
create or replace function set_reward_status(
  p_reward_id uuid,
  p_to        text,
  p_actor     text,
  p_note      text default null
)
returns boolean language plpgsql as $$
declare
  v_from text;
begin
  select status into v_from from referral_rewards where id = p_reward_id;
  if v_from is null then
    raise exception 'No such reward.' using errcode = 'no_data_found';
  end if;
  if v_from = p_to then
    return false;   -- already there; do not write a misleading audit row
  end if;

  update referral_rewards
     set status = p_to,
         updated_at = now(),
         approved_at = case when p_to = 'approved' then now() else approved_at end,
         paid_at     = case when p_to = 'paid'     then now() else paid_at end
   where id = p_reward_id;

  insert into reward_events (reward_id, from_status, to_status, actor, note)
  values (p_reward_id, v_from, p_to, p_actor, p_note);

  return true;
end;
$$;

-- ------------------------------------------------ the engine, one call
-- Idempotent. Safe to run on every sync, which is how it is driven.
--
--   1. Any referral whose candidate has joined but has no reward row gets one
--   2. Anything pending whose eligibility date has arrived becomes eligible
--
-- It deliberately does NOT approve anything. Approval is a human act with a
-- name against it (D17), and automating it would be the prototype's mistake.
create or replace function refresh_reward_states()
returns table (created integer, became_eligible integer) language plpgsql as $$
declare
  v_created  integer := 0;
  v_eligible integer := 0;
  r record;
begin
  -- 1. Create a ledger row for every newly joined referral.
  for r in
    select rf.id, rf.reward_amount_snapshot, rf.eligibility_days_snapshot, rf.joined_at
      from referrals rf
     where rf.joined_at is not null
       and not exists (select 1 from referral_rewards w where w.referral_id = rf.id)
  loop
    insert into referral_rewards
      (referral_id, amount, eligibility_days, status, joined_at, eligible_from)
    values
      (r.id, r.reward_amount_snapshot, r.eligibility_days_snapshot,
       'pending_joining', r.joined_at,
       (r.joined_at + make_interval(days => r.eligibility_days_snapshot))::date);

    insert into reward_events (reward_id, from_status, to_status, actor, note)
    select w.id, null, 'pending_joining', 'system', 'Candidate joined'
      from referral_rewards w where w.referral_id = r.id;

    v_created := v_created + 1;
  end loop;

  -- 2. Flip anything whose qualifying period has now elapsed.
  for r in
    select id from referral_rewards
     where status = 'pending_joining'
       and eligible_from is not null
       and eligible_from <= current_date
  loop
    if set_reward_status(r.id, 'eligible', 'system', 'Qualifying period complete') then
      v_eligible := v_eligible + 1;
    end if;
  end loop;

  return query select v_created, v_eligible;
end;
$$;

-- --------------------------------------------------------- admin actions
-- Approval refuses a reward whose amount nobody ever agreed to. Approving an
-- unconfirmed placeholder would commit the company to a number that was never
-- a decision.
create or replace function approve_reward(p_reward_id uuid, p_actor_id uuid)
returns boolean language plpgsql as $$
declare
  v_status    text;
  v_confirmed boolean;
  v_actor     text;
begin
  select w.status, rf.reward_confirmed_snapshot
    into v_status, v_confirmed
    from referral_rewards w
    join referrals rf on rf.id = w.referral_id
   where w.id = p_reward_id;

  if v_status is null then
    raise exception 'No such reward.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'eligible' then
    raise exception 'Only an eligible reward can be approved (this one is %).', v_status
      using errcode = 'check_violation';
  end if;
  if not coalesce(v_confirmed, false) then
    raise exception 'This role had no agreed reward when the referral was made. Set one before approving.'
      using errcode = 'check_violation';
  end if;

  select email into v_actor from employees where id = p_actor_id;

  update referral_rewards set approved_by = p_actor_id where id = p_reward_id;
  return set_reward_status(p_reward_id, 'approved', coalesce(v_actor, 'admin'), null);
end;
$$;

create or replace function mark_reward_paid(
  p_reward_id uuid,
  p_reference text,
  p_actor_id  uuid
)
returns boolean language plpgsql as $$
declare
  v_status text;
  v_actor  text;
begin
  select status into v_status from referral_rewards where id = p_reward_id;
  if v_status is null then
    raise exception 'No such reward.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'approved' then
    raise exception 'Only an approved reward can be marked paid (this one is %).', v_status
      using errcode = 'check_violation';
  end if;

  select email into v_actor from employees where id = p_actor_id;

  update referral_rewards
     set paid_reference = nullif(trim(p_reference), '')
   where id = p_reward_id;

  return set_reward_status(p_reward_id, 'paid', coalesce(v_actor, 'admin'),
                           nullif(trim(p_reference), ''));
end;
$$;

-- ------------------------------------------------------- reconciliation
-- Two of the three checks §12 asks for. The third — approved reward with no
-- payout — needs payroll, so here it is the Hub's own record of an approval
-- that has sat unpaid, which is the useful half of it anyway.
create or replace function reward_exceptions()
returns table (kind text, referral_id uuid, ref_code text, detail text)
language sql stable as $$
  -- A candidate joined and nobody is tracking a reward for them.
  select 'joined, no reward record'::text, rf.id, rf.ref_code,
         'Joined ' || to_char(rf.joined_at, 'DD Mon YYYY')
    from referrals rf
   where rf.joined_at is not null
     and not exists (select 1 from referral_rewards w where w.referral_id = rf.id)

  union all
  -- Approved more than 45 days ago and still not paid.
  select 'approved but unpaid'::text, rf.id, rf.ref_code,
         'Approved ' || to_char(w.approved_at, 'DD Mon YYYY')
    from referral_rewards w
    join referrals rf on rf.id = w.referral_id
   where w.status = 'approved'
     and w.approved_at < now() - interval '45 days'

  union all
  -- Eligible for a long time and never acted on.
  select 'eligible, not approved'::text, rf.id, rf.ref_code,
         'Eligible since ' || to_char(w.eligible_from, 'DD Mon YYYY')
    from referral_rewards w
    join referrals rf on rf.id = w.referral_id
   where w.status = 'eligible'
     and w.eligible_from < current_date - 30
$$;

revoke execute on function keka_stage_is_hired(text) from public;
revoke execute on function set_reward_status(uuid, text, text, text) from public;
revoke execute on function refresh_reward_states() from public;
revoke execute on function approve_reward(uuid, uuid) from public;
revoke execute on function mark_reward_paid(uuid, text, uuid) from public;
revoke execute on function reward_exceptions() from public;

commit;
