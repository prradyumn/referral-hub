-- Where the "How to refer" walkthrough video lives, once Comms has one.
--
-- The page used to show a dashed "Video to come from Comms" box to every
-- employee — a placeholder is fine in a prototype and a small embarrassment
-- in a live tool. Empty means the page shows nothing where the video goes.

begin;

insert into app_settings (key, value, description) values
  ('howto_video_url', '',
   'https link to the How to refer walkthrough. Empty hides the video slot. '
   'A direct .mp4/.webm plays in the page; any other link opens in a new tab.')
on conflict (key) do nothing;

commit;
