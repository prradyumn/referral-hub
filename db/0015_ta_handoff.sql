-- The handoff from a Hub referral to a recruiter.
--
-- A referral made in the Hub never reached Keka: the candidate push is off,
-- because every Keka job demands salary fields the form does not collect. So
-- "Refer someone" — the most prominent action in the app — recorded a
-- referral that no recruiter ever saw.
--
-- The Hub form has to stay the front door for now: it is the only route that
-- credits the employee, since Keka does not record who referred a candidate
-- in a form the Hub can read. So the bridge is a person: TA sees each new
-- referral in /admin/inbox and adds the candidate in Keka. From then the
-- stage sync matches the candidate by email and tracking runs on its own —
-- keka_last_seen_at marks that. ta_added_at is TA saying "done" before Keka's
-- data has caught up.

begin;

alter table referrals add column if not exists ta_added_at timestamptz;
alter table referrals add column if not exists ta_added_by uuid references employees (id);

create index if not exists referrals_inbox_idx
  on referrals (submitted_at desc)
  where ta_added_at is null and keka_last_seen_at is null;

commit;
