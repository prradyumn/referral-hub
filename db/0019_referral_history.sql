-- Referral history from before the Hub, for the leaderboard.
--
-- HR's sheet of referral bonuses since 2023 ("Copy of sheet 3", the master),
-- loaded by scripts/import-history.mjs. It exists to recognise people on the
-- leaderboard. It is NOT part of the reward ledger and never touches
-- referral_rewards: these bonuses were settled — or not — under the old
-- process, and nothing here may cause one to be paid again (D18).
--
-- Minimisation (§9): only what a ranking needs. No candidate name, phone,
-- job title or employment status is stored. candidate_key is an md5 of the
-- normalised candidate name — enough to avoid counting one hire twice, not a
-- way to read the name back. It is pseudonymous, not anonymous: a name can be
-- tested against it by anyone who already has the name.
--
-- Re-runnable: apply-schema.mjs replays every file on each run.

begin;

-- "S. Gokul" and "gokul s" are the same key: lower-case letters only, the
-- words sorted. Mirrors nameKey() in src/lib/keka/attribution.ts.
create or replace function name_key(p_name text)
returns text language sql immutable as $$
  select coalesce(string_agg(w, ' ' order by w), '')
    from regexp_split_to_table(
           lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z[:space:]]', ' ', 'g')),
           '[[:space:]]+') as w
   where w <> '';
$$;

create table if not exists historical_referrals (
  id                   uuid primary key default gen_random_uuid(),
  candidate_key        text not null check (candidate_key ~ '^[0-9a-f]{32}$'),
  referrer_name        text not null,
  referrer_key         text not null,
  referrer_designation text,
  referred_on          date,
  joined_on            date not null,
  -- The bonus as HR recorded it. Null where the sheet says N/A.
  amount_inr           integer check (amount_inr is null or amount_inr >= 0),
  -- paid: settled. owed: awarded but not yet paid. forfeited: the candidate
  -- left before it was earned — counts as a join, earns nothing.
  payout_status        text not null check (payout_status in ('paid', 'owed', 'forfeited')),
  source               text not null,
  imported_at          timestamptz not null default now(),
  unique (candidate_key, joined_on)
);

create index if not exists historical_referrals_joined_idx on historical_referrals (joined_on);
create index if not exists historical_referrals_referrer_idx on historical_referrals (referrer_key);

-- The only way rows get in. The candidate's name is passed in to derive
-- candidate_key and is not stored.
create or replace function import_historical_referral(
  p_candidate_name text,
  p_referrer_name  text,
  p_designation    text,
  p_referred_on    date,
  p_joined_on      date,
  p_amount_inr     integer,
  p_payout_status  text,
  p_source         text
)
returns text
language plpgsql set search_path = public as $$
declare
  v_candidate text := name_key(p_candidate_name);
  v_referrer  text := regexp_replace(trim(coalesce(p_referrer_name, '')), '\s+', ' ', 'g');
  v_inserted  boolean;
begin
  if v_candidate = '' then
    raise exception 'A history row needs a candidate name.' using errcode = 'check_violation';
  end if;
  if name_key(v_referrer) = '' then
    raise exception 'A history row needs a referrer name.' using errcode = 'check_violation';
  end if;

  insert into historical_referrals
    (candidate_key, referrer_name, referrer_key, referrer_designation, referred_on,
     joined_on, amount_inr, payout_status, source)
  values
    (md5(v_candidate), v_referrer, name_key(v_referrer), nullif(trim(p_designation), ''),
     p_referred_on, p_joined_on, p_amount_inr, p_payout_status, p_source)
  on conflict (candidate_key, joined_on) do update set
    -- Re-importing a corrected sheet corrects the row.
    referrer_name        = excluded.referrer_name,
    referrer_key         = excluded.referrer_key,
    referrer_designation = excluded.referrer_designation,
    referred_on          = excluded.referred_on,
    amount_inr           = excluded.amount_inr,
    payout_status        = excluded.payout_status,
    source               = excluded.source,
    imported_at          = now()
  returning (xmax = 0) into v_inserted;

  return case when v_inserted then 'inserted' else 'updated' end;
end;
$$;

revoke execute on function import_historical_referral(text, text, text, date, date, integer, text, text) from public;

commit;
