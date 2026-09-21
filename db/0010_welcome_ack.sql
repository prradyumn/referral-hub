-- Record that an employee has been shown the programme poster.
--
-- Server-side rather than localStorage: the poster is mandatory, and
-- localStorage is per-browser. Someone who signs in on their phone after
-- reading it on a laptop should not be made to read it again, and clearing
-- site data should not silently reset a thing we are treating as an
-- acknowledgement.

begin;

alter table employees add column if not exists welcome_ack_at timestamptz;

comment on column employees.welcome_ack_at is
  'When this employee acknowledged the programme poster. Null means they have '
  'not yet, and the gate shows on their next page load.';

commit;
