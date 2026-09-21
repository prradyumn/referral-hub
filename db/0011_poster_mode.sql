-- How often the programme poster appears.
--
-- Asked for as "after every refresh at home page", which is what this
-- defaults to. Kept as configuration rather than hard-coded because the
-- trade-off is a real one and belongs to HR, not to whoever last edited the
-- component: a poster on every visit is seen by everybody, and is also the
-- thing people learn to click past fastest. `once` is one setting change
-- away if that turns out to be the case.

begin;

insert into app_settings (key, value, description) values
  ('welcome_poster_mode', 'every_visit',
   'every_visit | once. Whether the programme poster appears on every visit '
   'to Home, or only until an employee has acknowledged it once.')
on conflict (key) do nothing;

commit;
