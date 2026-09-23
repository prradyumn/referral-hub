-- Reward bands, and gifts earned on reward points.
--
-- HR supplied the band table on 23 Sep 2026: a referral reward per band
-- (B1–B8+), separately for Engineering and Non-Engineering. Keka carries no
-- band on a job, so each role's band is worked out in src/lib/bands.ts and
-- this file records both the table and where each role's band came from.
--
-- Milestone gifts change from "N referrals join" to reward points: 1 point
-- per rupee of referral reward earned on people who joined. Smartwatch at
-- 1,00,000, smartphone at 2,00,000, vacation at 3,50,000, Harley at 4,00,000.

begin;

-- ------------------------------------------------------------ band table
create table if not exists reward_bands (
  track        text not null check (track in ('engineering', 'non_engineering')),
  band         text not null,
  designation  text not null,
  amount       integer not null check (amount >= 0),
  -- How HR wrote it, where that is not a single figure.
  amount_label text,
  -- True where the table's own wording is ambiguous. A role in such a band
  -- is never shown to employees with a figure until HR says what it means.
  needs_clarification boolean not null default false,
  sort_order   integer not null,
  updated_at   timestamptz not null default now(),
  primary key (track, band)
);

insert into reward_bands (track, band, designation, amount, amount_label, needs_clarification, sort_order) values
  ('engineering',     'B8+', 'VP & Above',                              180000, null, false, 1),
  ('engineering',     'B7',  'AVP',                                     150000, null, false, 2),
  ('engineering',     'B6',  'Sr Principal Engineer or General Manager', 120000, null, false, 3),
  ('engineering',     'B5',  'Principal Engineer',                      100000, null, false, 4),
  ('engineering',     'B4',  'SDE 3',                                    80000, null, false, 5),
  ('engineering',     'B3',  'SDE 2',                                    60000, null, false, 6),
  ('engineering',     'B2',  'SDE 1',                                    40000, null, false, 7),
  ('engineering',     'B1',  'Jr Associate',                             15000, null, false, 8),
  ('non_engineering', 'B8+', 'VP & Above',                              120000, null, false, 11),
  ('non_engineering', 'B7',  'AVP',                                     100000, null, false, 12),
  ('non_engineering', 'B6',  'Sr Manager, General Manager',              80000, null, false, 13),
  ('non_engineering', 'B5',  'Manager',                                  60000, null, false, 14),
  ('non_engineering', 'B4',  'Assistant Manager',                        40000, null, false, 15),
  ('non_engineering', 'B3',  'Sr Associate',                             20000, null, false, 16),
  ('non_engineering', 'B2',  'Associate',                                10000, null, false, 17),
  -- "2000 + 5000" in HR's table. It could be a split payment (₹2,000 on
  -- joining, ₹5,000 later) or a figure per designation (₹2,000 for a Jr
  -- Associate, ₹5,000 for a Fellow). Held until HR says which: eight open
  -- Fellows roles depend on it.
  ('non_engineering', 'B1',  'Jr Associate / Fellow',                     7000, '₹2,000 + ₹5,000', true, 18)
on conflict (track, band) do nothing;

-- ----------------------------------------------------------- per role
alter table jobs add column if not exists track text;
alter table jobs add column if not exists band  text;
-- title | experience | none — how the band was inferred; hr — HR chose it.
alter table jobs add column if not exists band_source text;
-- band — the reward follows the band table; custom — HR typed a figure for
-- this role, and band changes must leave it alone.
alter table jobs add column if not exists reward_origin text not null default 'band';

-- Roles HR has already given a figure by hand keep it.
update jobs set reward_origin = 'custom'
 where reward_confirmed and source = 'keka' and reward_origin = 'band' and band is null;

-- --------------------------------------------- apply bands to many roles
-- One call for the whole set, for the same Virginia-latency reason every
-- other batch in this schema exists. Called after each jobs sync, so a role
-- that arrives from Keka tomorrow is banded without anyone lifting a finger.
--
-- Leaves alone any role whose band HR chose, or whose reward HR typed.
-- Applies a figure to employees only when the title named a designation and
-- the band is unambiguous; otherwise records the suggestion for HR.
create or replace function apply_job_bands(p_rows jsonb)
returns table (applied integer, suggested integer, held integer)
language plpgsql as $$
declare
  r         record;
  j         jobs%rowtype;
  b         reward_bands%rowtype;
  v_applied integer := 0;
  v_sugg    integer := 0;
  v_held    integer := 0;
begin
  for r in
    select * from jsonb_to_recordset(p_rows)
      as x(job_id uuid, track text, band text, source text)
  loop
    select * into j from jobs where id = r.job_id;
    if not found or j.reward_origin = 'custom' or j.band_source = 'hr' then
      continue;
    end if;

    update jobs set track = r.track, band = r.band, band_source = r.source
     where id = r.job_id;

    select * into b from reward_bands where track = r.track and band = r.band;
    if not found then
      continue;
    end if;

    if r.source = 'title' and not b.needs_clarification then
      perform set_job_reward(r.job_id, b.amount, j.eligibility_days, j.is_priority);
      v_applied := v_applied + 1;
    else
      -- The suggested figure is stored so HR sees it, but the role stays
      -- unconfirmed, which is what keeps it off every employee's screen.
      update jobs set reward_amount = b.amount, reward_confirmed = false
       where id = r.job_id;
      if b.needs_clarification then v_held := v_held + 1; else v_sugg := v_sugg + 1; end if;
    end if;
  end loop;

  return query select v_applied, v_sugg, v_held;
end;
$$;

-- ------------------------------------------------ HR picks a role's band
create or replace function set_job_band(p_job_id uuid, p_track text, p_band text)
returns integer language plpgsql as $$
declare
  b reward_bands%rowtype;
  j jobs%rowtype;
begin
  select * into b from reward_bands where track = p_track and band = p_band;
  if not found then
    raise exception 'No such band.' using errcode = 'check_violation';
  end if;
  if b.needs_clarification then
    raise exception 'Band % (%) needs its amount clarified before roles can use it.', p_band,
      replace(p_track, '_', '-') using errcode = 'check_violation';
  end if;
  select * into j from jobs where id = p_job_id;

  update jobs set track = p_track, band = p_band, band_source = 'hr', reward_origin = 'band'
   where id = p_job_id;
  perform set_job_reward(p_job_id, b.amount, j.eligibility_days, j.is_priority);
  return b.amount;
end;
$$;

-- -------------------------------------------- HR edits the band table
-- Re-applies to every role whose reward follows that band. Referrals already
-- made keep what they were promised (convention 3); set_job_reward only
-- settles ones taken while the role had no agreed figure.
create or replace function set_band_amount(
  p_track text, p_band text, p_amount integer, p_label text
)
returns integer language plpgsql as $$
declare
  j record;
  n integer := 0;
begin
  update reward_bands
     set amount = p_amount, amount_label = nullif(trim(p_label), ''),
         needs_clarification = false, updated_at = now()
   where track = p_track and band = p_band;
  if not found then
    raise exception 'No such band.' using errcode = 'check_violation';
  end if;

  for j in
    select id, eligibility_days, is_priority, band_source from jobs
     where track = p_track and band = p_band and reward_origin = 'band'
  loop
    if j.band_source in ('title', 'hr') then
      perform set_job_reward(j.id, p_amount, j.eligibility_days, j.is_priority);
    else
      update jobs set reward_amount = p_amount where id = j.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ------------------------------------------------------ gifts on points
alter table milestone_tiers add column if not exists art text;

update milestone_tiers set threshold = 100000, art = 'watch', sort_order = 10,
  blurb = 'Earn 1,00,000 reward points and a smartwatch is yours.'
 where name = 'Smartwatch';
update milestone_tiers set threshold = 200000, art = 'phone', sort_order = 20,
  blurb = 'Reach 2,00,000 reward points for a smartphone.'
 where name = 'Smartphone';
update milestone_tiers set threshold = 400000, art = 'harley', sort_order = 40,
  blurb = 'The one people talk about, at 4,00,000 reward points.'
 where name ilike 'Harley%';
insert into milestone_tiers (name, threshold, blurb, sort_order, art)
select 'Vacation', 350000, 'A paid vacation at 3,50,000 reward points.', 30, 'vacation'
 where not exists (select 1 from milestone_tiers where name = 'Vacation');

insert into app_settings (key, value, description) values
  ('milestone_basis', 'points',
   'points: 1 point per rupee of referral reward earned on people who joined. '
   'Gift tiers in milestone_tiers are thresholds in points.')
on conflict (key) do update set value = excluded.value;

revoke execute on function apply_job_bands(jsonb) from public;
revoke execute on function set_job_band(uuid, text, text) from public;
revoke execute on function set_band_amount(text, text, integer, text) from public;

commit;
