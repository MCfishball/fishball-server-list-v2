-- FishBall V2: additive authorization helpers.
-- Existing user, VIP, nickname, favorites, and server tables are intentionally untouched.
--
-- Contract:
--   The authentication layer must expose `role` and `is_vip` in app_metadata.
--   Examples:
--     app_metadata.role = "admin"
--     app_metadata.is_vip = true
--   Keep these claims synchronized with the existing FishBall VIP/admin source of truth.

create or replace function public.fishball_v2_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

create or replace function public.fishball_v2_is_vip()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    ((select auth.jwt() -> 'app_metadata' ->> 'is_vip')::boolean),
    false
  );
$$;

revoke all on function public.fishball_v2_is_admin() from public;
revoke all on function public.fishball_v2_is_vip() from public;
grant execute on function public.fishball_v2_is_admin() to authenticated;
grant execute on function public.fishball_v2_is_vip() to authenticated;

