-- Roles whose title names no designation take their band's reward directly.
--
-- HR, 23 Sep 2026: "keep the pay reward band-wise as I have given you if the
-- role isn't specified." Until now a band inferred from experience was held
-- back from employees until someone confirmed it. It is now applied, like a
-- title match. band_source still records 'experience', so HR can see which
-- roles were inferred and move any that are wrong.
--
-- A setting rather than a change of rule, so the cautious behaviour is one
-- switch away. Bands whose amount HR wrote ambiguously stay held either way.

begin;

insert into app_settings (key, value, description) values
  ('auto_apply_experience_bands', 'true',
   'true: a role whose title names no designation takes the reward of the band '
   'inferred from its experience. false: that band is only suggested, and the '
   'role shows "To be confirmed" until HR confirms it.')
on conflict (key) do update set value = excluded.value;

create or replace function apply_job_bands(p_rows jsonb)
returns table (applied integer, suggested integer, held integer)
language plpgsql as $$
declare
  r         record;
  j         jobs%rowtype;
  b         reward_bands%rowtype;
  v_auto    boolean := coalesce(setting('auto_apply_experience_bands'), 'true') = 'true';
  v_applied integer := 0;
  v_sugg    integer := 0;
  v_held    integer := 0;
begin
  for r in
    select * from jsonb_to_recordset(p_rows)
      as x(job_id uuid, track text, band text, source text)
  loop
    select * into j from jobs where id = r.job_id;
    if not found or j.reward_origin = 'custom' or j.band_source = 'hr' then
      continue;
    end if;

    update jobs set track = r.track, band = r.band, band_source = r.source
     where id = r.job_id;

    select * into b from reward_bands where track = r.track and band = r.band;
    if not found then
      continue;
    end if;

    if b.needs_clarification then
      update jobs set reward_amount = b.amount, reward_confirmed = false where id = r.job_id;
      v_held := v_held + 1;
    elsif r.source = 'title' or (r.source = 'experience' and v_auto) then
      perform set_job_reward(r.job_id, b.amount, j.eligibility_days, j.is_priority);
      v_applied := v_applied + 1;
    else
      update jobs set reward_amount = b.amount, reward_confirmed = false where id = r.job_id;
      v_sugg := v_sugg + 1;
    end if;
  end loop;

  return query select v_applied, v_sugg, v_held;
end;
$$;

revoke execute on function apply_job_bands(jsonb) from public;

commit;
