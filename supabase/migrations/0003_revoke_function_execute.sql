-- Referral Hub · 0003 — actually revoke function EXECUTE from the API roles
--
-- 0002 ran `revoke all on all functions in schema public from anon, authenticated`
-- and that did nothing, for two compounding reasons:
--
--   1. Postgres grants EXECUTE on every new function to the pseudo-role PUBLIC.
--      anon and authenticated inherit from PUBLIC, so revoking from them by name
--      leaves the inherited grant untouched. (Tables are not granted to PUBLIC by
--      default, which is why the table revokes in 0002 *did* work.)
--
--   2. The revoke ran in step 1; submit_referral was re-created in step 5 of the
--      same transaction. A fresh CREATE re-grants EXECUTE to PUBLIC regardless.
--
-- Verified after 0002: has_function_privilege('anon', …, 'EXECUTE') was true for
-- every function in public, including submit_referral. With the publishable key
-- being public by design, that left the write path reachable over PostgREST.
--
-- Run AFTER 0002. Safe to re-run.

begin;

revoke all on function public.submit_referral(
  uuid, uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated;

revoke all on function public.setting(text)              from public, anon, authenticated;
revoke all on function public.normalise_email(text)      from public, anon, authenticated;
revoke all on function public.normalise_phone(text)      from public, anon, authenticated;
revoke all on function public.enforce_employee_domain()  from public, anon, authenticated;

-- Future functions created in this schema by this role do not hand EXECUTE to
-- PUBLIC. Without this the hole reopens the next time someone adds a function.
alter default privileges in schema public revoke execute on functions from public;

commit;
