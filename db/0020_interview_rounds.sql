-- Show the referrer which interview round their candidate is in.
--
-- db/0006 folded Interview L1, L2 and L3 into one phrase, "Interviewing", and
-- called that provisional until D15. HR's answer (8 Oct 2026): name the round.
-- The round is still all the referrer sees — feedback, scores and outcomes of
-- each round stay in Keka (commitment 2).
--
-- 0006 now inserts with `do nothing`, so replaying it no longer puts the old
-- wording back over this.

begin;

update keka_stage_map
   set employee_wording = v.wording,
       updated_at       = now()
  from (values
    ('Interview L1', 'First round of interview'),
    ('Interview L2', 'Second round of interview'),
    ('Interview L3', 'Third round of interview')
  ) as v(stage, wording)
 where keka_stage_map.keka_stage_id = v.stage
   and keka_stage_map.employee_wording is distinct from v.wording;

-- referrals.current_stage holds the wording, not the Keka stage, so referrals
-- already sitting on "Interviewing" keep it until their next stage change.
-- Re-point each one at the round it is actually in: its latest interview
-- stage. Matches nothing on a replay, because nothing reads "Interviewing" by
-- then.
update referrals r
   set current_stage = m.employee_wording
  from (
    select distinct on (s.referral_id) s.referral_id, s.stage
      from referral_stages s
     where s.stage in ('Interview L1', 'Interview L2', 'Interview L3')
     order by s.referral_id, s.occurred_at desc
  ) latest
  join keka_stage_map m on m.keka_stage_id = latest.stage
 where r.id = latest.referral_id
   and r.current_stage = 'Interviewing';

commit;
