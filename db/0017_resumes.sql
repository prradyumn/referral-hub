-- Résumés, stored with the referral, and an audit trail for reading them.
--
-- Why here and not in Keka: the candidate push is off (§16 — every Keka job
-- requires salary fields the Hub will not collect), so TA adds each candidate
-- to Keka by hand from /admin/inbox. They need the CV to attach while doing it.
--
-- Why Postgres and not object storage: at ~412 referrals a year a CV table
-- grows by well under 100 MB a year. Keeping the file beside its referral
-- makes it private by construction — there is no URL for it anywhere, public
-- or signed — and it goes with the referral in one DELETE when a DPDP erasure
-- or the retention purge runs. There is exactly one reader,
-- src/app/(app)/admin/resume/[id]/route.ts, so moving to Blob or into Keka
-- later is a one-file change.
--
-- §9 asks for two things this delivers, and one it does not:
--   · every résumé download audited             — pii_access_log, append-only
--   · rate limits on submission                 — not here; still owed
--   · scanning before the file is readable      — NOT delivered. Uploads pass
--     structural checks (src/lib/resume.ts) but are not virus-scanned.
--     av_scanned_at stays null until a scanner exists, and the admin screen
--     says so beside every download.
--
-- Re-runnable: apply-schema.mjs replays every file on each run.

begin;

-- ------------------------------------------------------------------ résumés
create table if not exists referral_resumes (
  -- One CV per referral. A re-referral after the validity window is a new
  -- referral with its own candidate row, so it gets its own CV too.
  referral_id   uuid primary key references referrals (id) on delete cascade,
  -- As the referrer named it, sanitised. Shown to TA; never used as a path.
  file_name     text not null,
  -- Decided from the file's own bytes, never from what the browser claimed.
  content_type  text not null check (content_type in (
                  'application/pdf',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  -- 4 MB. Vercel refuses function bodies over 4.5 MB before the app sees
  -- them, so a higher cap here would be a limit nobody could reach.
  size_bytes    integer not null check (size_bytes between 1 and 4194304),
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  data          bytea not null,
  -- Null until an antivirus scan has run. See the header.
  av_scanned_at timestamptz,
  uploaded_at   timestamptz not null default now()
);

-- PDF and DOCX are already compressed. The default storage would spend CPU
-- trying to compress them again on every write, for nothing.
alter table referral_resumes alter column data set storage external;

-- ------------------------------------------------------------ access audit
-- §9: "Every CSV export and résumé download audited, because both move
-- candidate PII."
--
-- Deliberately no foreign keys. The log is evidence of who read what, so it
-- must outlive both the referral (a DPDP erasure deletes that) and the
-- employee. actor_email is kept so a row still reads after the employee row
-- is gone. It holds ids, never candidate data: a file name can contain the
-- candidate's name, so it is not recorded here.
create table if not exists pii_access_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid not null,
  actor_email text not null,
  action      text not null check (action in ('resume.download')),
  referral_id uuid,
  occurred_at timestamptz not null default now()
);

create index if not exists pii_access_log_referral_idx
  on pii_access_log (referral_id, occurred_at desc);

-- Append-only. This stops application bugs and accidents; it does not stop
-- the database owner, who can disable a trigger. A log the owner cannot
-- touch needs shipping somewhere else, and that is a Phase 1 audit question.
create or replace function pii_access_log_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'pii_access_log is append-only';
end;
$$;

drop trigger if exists pii_access_log_no_change on pii_access_log;
create trigger pii_access_log_no_change
  before update or delete on pii_access_log
  for each row execute function pii_access_log_append_only();

-- A row trigger does not fire on TRUNCATE, which would otherwise empty the
-- log in one statement.
drop trigger if exists pii_access_log_no_truncate on pii_access_log;
create trigger pii_access_log_no_truncate
  before truncate on pii_access_log
  for each statement execute function pii_access_log_append_only();

-- Matches 0003: nothing reachable through the old API roles.
revoke execute on function pii_access_log_append_only() from public;

commit;
