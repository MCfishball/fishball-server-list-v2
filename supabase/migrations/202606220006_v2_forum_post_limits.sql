-- FishBall V2 forum posting limits.
-- Final rules:
--   Normal users: 1 post per Hong Kong day, 60 second cooldown.
--   VIP users:    3 posts per Hong Kong day, 20 second cooldown.
--   Admins:       unlimited posts, no cooldown.

create or replace function public.fishball_v2_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  has_admin_row boolean := false;
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) then
    return true;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  if to_regclass('public.admins') is not null then
    execute 'select exists (select 1 from public.admins where user_id = $1)'
      into has_admin_row
      using auth.uid();
  end if;

  return coalesce(has_admin_row, false);
end;
$$;

create or replace function public.fishball_v2_is_vip()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  has_vip_row boolean := false;
begin
  if coalesce(((auth.jwt() -> 'app_metadata' ->> 'is_vip')::boolean), false) then
    return true;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  if to_regclass('public.vip_users') is not null then
    execute '
      select exists (
        select 1
        from public.vip_users
        where user_id = $1
          and (expires_at is null or expires_at > now())
      )'
      into has_vip_row
      using auth.uid();
  end if;

  return coalesce(has_vip_row, false);
end;
$$;

revoke all on function public.fishball_v2_is_admin() from public;
revoke all on function public.fishball_v2_is_vip() from public;
grant execute on function public.fishball_v2_is_admin() to authenticated;
grant execute on function public.fishball_v2_is_vip() to authenticated;

create index if not exists posts_user_created_idx
on public.posts (user_id, created_at desc);

create or replace function public.fishball_v2_get_posting_limits()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  is_admin_user boolean;
  is_vip_user boolean;
  day_start timestamptz;
  day_end timestamptz;
  today_count integer := 0;
  latest_post_at timestamptz;
  daily_limit integer;
  cooldown_seconds integer;
  cooldown_remaining integer := 0;
begin
  if current_user_id is null then
    raise exception '请先登录后再发帖';
  end if;

  is_admin_user := public.fishball_v2_is_admin();
  is_vip_user := public.fishball_v2_is_vip();

  if is_admin_user then
    daily_limit := null;
    cooldown_seconds := 0;
  elsif is_vip_user then
    daily_limit := 3;
    cooldown_seconds := 20;
  else
    daily_limit := 1;
    cooldown_seconds := 60;
  end if;

  day_start := date_trunc('day', now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong';
  day_end := day_start + interval '1 day';

  select count(*)::integer, max(created_at)
    into today_count, latest_post_at
  from public.posts
  where user_id = current_user_id
    and created_at >= day_start
    and created_at < day_end;

  if not is_admin_user and latest_post_at is not null then
    cooldown_remaining := greatest(
      0,
      ceil(extract(epoch from (latest_post_at + make_interval(secs => cooldown_seconds) - now())))::integer
    );
  end if;

  return jsonb_build_object(
    'role', case when is_admin_user then 'admin' when is_vip_user then 'vip' else 'user' end,
    'dailyLimit', daily_limit,
    'postsToday', today_count,
    'remainingToday', case
      when daily_limit is null then null
      else greatest(daily_limit - today_count, 0)
    end,
    'cooldownSeconds', cooldown_seconds,
    'cooldownRemainingSeconds', cooldown_remaining
  );
end;
$$;

revoke all on function public.fishball_v2_get_posting_limits() from public;
grant execute on function public.fishball_v2_get_posting_limits() to authenticated;

create or replace function public.enforce_fishball_v2_post_create_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits jsonb;
  role_name text;
  daily_limit integer;
  posts_today integer;
  cooldown_remaining integer;
begin
  if auth.uid() is null then
    raise exception '请先登录后再发帖';
  end if;

  if new.user_id <> auth.uid() then
    raise exception '只能以当前登录用户身份发帖';
  end if;

  limits := public.fishball_v2_get_posting_limits();
  role_name := limits ->> 'role';

  if role_name = 'admin' then
    return new;
  end if;

  daily_limit := (limits ->> 'dailyLimit')::integer;
  posts_today := (limits ->> 'postsToday')::integer;
  cooldown_remaining := (limits ->> 'cooldownRemainingSeconds')::integer;

  if posts_today >= daily_limit then
    if role_name = 'vip' then
      raise exception 'VIP用户每天最多发布 3 个帖子';
    end if;

    raise exception '普通用户每天最多发布 1 个帖子，开通 VIP 可提升至 3 个';
  end if;

  if cooldown_remaining > 0 then
    raise exception '发帖太快了，请等待 % 秒后再发布', cooldown_remaining;
  end if;

  return new;
end;
$$;

drop trigger if exists posts_enforce_create_limits on public.posts;
create trigger posts_enforce_create_limits
before insert on public.posts
for each row execute function public.enforce_fishball_v2_post_create_limits();

revoke all on function public.enforce_fishball_v2_post_create_limits() from public;
