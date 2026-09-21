-- Wire the `Hired` stage through to the reward ledger.
--
-- Separate from 0007 because keka_stage_is_hired() must exist before
-- record_referral_stage() can be redefined to call it.

begin;

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

  insert into keka_stage_map (keka_stage_id, keka_stage_name, is_visible)
  values (p_stage, p_stage, false)
  on conflict (keka_stage_id) do nothing;

  -- Idempotency key is (referral, stage, when). Comparing against "the most
  -- recent stage" broke whenever Keka's date predated the Hub's own
  -- submission row; see db/0004.
  insert into referral_stages (referral_id, stage, occurred_at, source)
  values (p_referral_id, p_stage, v_at, p_source)
  on conflict (referral_id, stage, occurred_at) do nothing;

  get diagnostics v_added = row_count;
  if not v_added then
    return false;
  end if;

  -- The candidate joined. This is the single fact the whole reward ledger
  -- hangs on, and the 21 Sep scan confirmed Keka reports it with the scopes
  -- we already have. Earliest hired stage wins, so a later correction does
  -- not push the qualifying clock back.
  if keka_stage_is_hired(p_stage) then
    update referrals
       set joined_at = least(coalesce(joined_at, v_at), v_at)
     where id = p_referral_id;
  end if;

  select employee_wording, is_visible
    into v_wording, v_visible
    from keka_stage_map
   where keka_stage_id = p_stage;

  if not coalesce(v_visible, false) or v_wording is null then
    return true;
  end if;

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

revoke execute on function record_referral_stage(uuid, text, timestamptz, text) from public;

commit;
