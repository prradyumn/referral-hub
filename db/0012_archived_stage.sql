-- Archived candidates: how Keka takes someone out of the process.
--
-- db/0006 removed a guessed "Archived" row because nothing in a 30-job scan
-- used it — the scan only read active candidates, and Keka hides archived
-- ones unless asked. A later check (23 Sep 2026) found 73 archived candidates
-- across 15 referral-enabled jobs, every one on stage "Archived", with who
-- archived them, when, and why.
--
-- The employee is told the referral closed, never why. Silent: nobody is
-- notified of a rejection, and the reason Keka records is never read.

begin;

insert into keka_stage_map
  (keka_stage_id, keka_stage_name, employee_wording, is_visible, notifies, sort_order)
values
  ('Archived', 'Archived', 'No longer in process', true, false, 60)
on conflict (keka_stage_id) do update set
  employee_wording = excluded.employee_wording,
  is_visible       = excluded.is_visible,
  notifies         = excluded.notifies,
  sort_order       = excluded.sort_order,
  updated_at       = now();

commit;
