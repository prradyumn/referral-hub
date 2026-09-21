-- §12 puts the leaderboard behind a feature flag on purpose: publicly ranking
-- colleagues is a culture decision, not a product one. Default off.
begin;
insert into app_settings (key, value, description) values
  ('leaderboard_enabled', 'false',
   'Whether employees can see the leaderboard. Off by default — §12 treats '
   'public ranking of colleagues as a culture decision for HR, not a default.')
on conflict (key) do nothing;
commit;
