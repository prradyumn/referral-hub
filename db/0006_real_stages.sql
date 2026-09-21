-- The hiring stages this tenant actually uses.
--
-- db/0004 seeded the map from a six-job sample that only ever reached
-- `Sourced` and `Shortlisted`; the rest were educated guesses. A 30-job scan
-- on 21 Sep 2026 (2,643 candidates) showed the real vocabulary, and the
-- guesses did not match it:
--
--   Sourced 2478 · Shortlisted 94 · Interview L1 29 · Hired 20
--   Interview L2 10 · Preboarding 8 · Interview L3 4
--
-- The guessed `Interview` and `Offer` rows match nothing, so those stages
-- would have been recorded and shown to nobody. This replaces them.
--
-- The three interview rounds deliberately collapse to one employee-facing
-- phrase. Which round a candidate is on is process detail the referrer has no
-- need for, and commitment 2 keeps the inside of the process inside. Still
-- provisional until D15.

begin;

insert into keka_stage_map
  (keka_stage_id, keka_stage_name, employee_wording, is_visible, notifies, sort_order)
values
  ('Sourced',      'Sourced',      'Referral received',    true,  false, 10),
  ('Shortlisted',  'Shortlisted',  'Profile shortlisted',  true,  true,  20),
  ('Interview L1', 'Interview L1', 'Interviewing',         true,  true,  30),
  ('Interview L2', 'Interview L2', 'Interviewing',         true,  false, 31),
  ('Interview L3', 'Interview L3', 'Interviewing',         true,  false, 32),
  ('Preboarding',  'Preboarding',  'Offer accepted',       true,  true,  40),
  ('Hired',        'Hired',        'Joined',               true,  true,  50)
on conflict (keka_stage_id) do update set
  keka_stage_name  = excluded.keka_stage_name,
  employee_wording = excluded.employee_wording,
  is_visible       = excluded.is_visible,
  notifies         = excluded.notifies,
  sort_order       = excluded.sort_order,
  updated_at       = now();

-- Guesses that match nothing in this tenant. Removing them keeps the admin
-- stage table an honest picture of what Keka actually sends.
delete from keka_stage_map
 where keka_stage_id in ('Screening', 'Interview', 'Offer', 'Joined', 'Rejected', 'Archived')
   and not exists (
     select 1 from referral_stages s where s.stage = keka_stage_map.keka_stage_id
   );

-- Keka's ApplicationStatus, observed alongside the stages above:
--   0 = sourced   1 = in process   2 = preboarding   3 = hired
-- Recorded as configuration so the reward engine has a definition of "joined"
-- that does not depend on a stage name someone may rename in Keka.
insert into app_settings (key, value, description) values
  ('keka_hired_stages', 'Hired',
   'Comma-separated Keka stage names that mean the candidate joined. Drives '
   'reward eligibility. Observed in this tenant on 21 Sep 2026.'),
  ('keka_hired_app_status', '3',
   'Keka ApplicationStatus value meaning hired. A cross-check on the stage name.')
on conflict (key) do nothing;

commit;
