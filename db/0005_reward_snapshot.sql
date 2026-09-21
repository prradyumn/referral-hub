-- Snapshot whether the reward was actually agreed when a referral was made.
--
-- db/0001 already snapshots reward_amount onto each referral (convention 3: a
-- promise made is a promise kept). What it could not know about was a role
-- whose reward had never been set at all — a thing that only exists since jobs
-- started arriving from Keka, which has no concept of a referral reward.
--
-- Without this column the referral screens read `reward_confirmed` from the
-- job's CURRENT state, so a referral made while the reward was unset would
-- start displaying the stale ₹10,000 placeholder as a real figure the moment
-- HR confirmed a different amount. That is precisely the promise this product
-- exists to keep.

begin;

alter table referrals
  add column if not exists reward_confirmed_snapshot boolean not null default false;

-- Referrals made against the ten prototype roles had genuine figures.
update referrals r
   set reward_confirmed_snapshot = true
  from jobs j
 where j.id = r.job_id
   and j.source = 'seed'
   and not r.reward_confirmed_snapshot;

-- ------------------------------------------------- set a role's reward
-- Used by the admin screen. Also settles any referral that was taken while
-- the role had no agreed reward.
--
-- The policy, stated plainly: if nobody had decided a reward when the
-- referral was made, the employee was promised nothing specific — so they get
-- the first real rate, not the placeholder. A referral made when a rate DID
-- apply keeps that rate, which is convention 3 and is left untouched here.
create or replace function set_job_reward(
  p_job_id           uuid,
  p_reward           integer,
  p_eligibility_days integer,
  p_is_priority      boolean
)
returns table (referrals_settled integer) language plpgsql as $$
declare
  v_settled integer;
begin
  if p_reward < 0 then
    raise exception 'A reward cannot be negative.' using errcode = 'check_violation';
  end if;

  update jobs
     set reward_amount    = p_reward,
         eligibility_days = p_eligibility_days,
         is_priority      = p_is_priority,
         reward_confirmed = true
   where id = p_job_id;

  with settled as (
    update referrals
       set reward_amount_snapshot    = p_reward,
           eligibility_days_snapshot = p_eligibility_days,
           reward_confirmed_snapshot = true
     where job_id = p_job_id
       and not reward_confirmed_snapshot
     returning id
  )
  select count(*) into v_settled from settled;

  return query select v_settled;
end;
$$;

revoke execute on function set_job_reward(uuid, integer, integer, boolean) from public;

commit;
