-- FishBall V2 forum post report system.
-- Adds a real Supabase-backed report queue without changing existing forum/VIP/favorites logic.

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  reporter_id uuid not null,
  reporter_email text,
  reporter_nickname text,
  post_author_id uuid,
  reason text not null,
  description text,
  status text not null default 'pending',
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.post_reports
  add column if not exists post_id uuid,
  add column if not exists reporter_id uuid,
  add column if not exists reporter_email text,
  add column if not exists reporter_nickname text,
  add column if not exists post_author_id uuid,
  add column if not exists reason text,
  add column if not exists description text,
  add column if not exists status text not null default 'pending',
  add column if not exists admin_note text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'post_reports_post_id_fkey'
      and conrelid = 'public.post_reports'::regclass
  ) then
    alter table public.post_reports
      add constraint post_reports_post_id_fkey
      foreign key (post_id) references public.posts(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'post_reports_status_check'
      and conrelid = 'public.post_reports'::regclass
  ) then
    alter table public.post_reports
      add constraint post_reports_status_check
      check (status in ('pending', 'reviewing', 'resolved', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'post_reports_reason_check'
      and conrelid = 'public.post_reports'::regclass
  ) then
    alter table public.post_reports
      add constraint post_reports_reason_check
      check (reason in ('垃圾广告', '恶意刷帖', '不友善内容', '违法违规', '标题党 / 无意义内容', '其他'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'post_reports_description_length_check'
      and conrelid = 'public.post_reports'::regclass
  ) then
    alter table public.post_reports
      add constraint post_reports_description_length_check
      check (description is null or char_length(description) <= 300);
  end if;
end $$;

create unique index if not exists post_reports_post_reporter_uidx
on public.post_reports (post_id, reporter_id);

create index if not exists post_reports_post_id_idx on public.post_reports (post_id);
create index if not exists post_reports_reporter_id_idx on public.post_reports (reporter_id);
create index if not exists post_reports_status_idx on public.post_reports (status);
create index if not exists post_reports_created_at_idx on public.post_reports (created_at desc);
create index if not exists post_reports_post_author_id_idx on public.post_reports (post_author_id);

create or replace function public.fishball_v2_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists post_reports_set_updated_at on public.post_reports;
create trigger post_reports_set_updated_at
before update on public.post_reports
for each row execute function public.fishball_v2_set_updated_at();

alter table public.post_reports enable row level security;

drop policy if exists "users insert own post reports" on public.post_reports;
create policy "users insert own post reports"
on public.post_reports for insert to authenticated
with check (reporter_id = (select auth.uid()));

drop policy if exists "users read own post reports and admins read all" on public.post_reports;
create policy "users read own post reports and admins read all"
on public.post_reports for select to authenticated
using (reporter_id = (select auth.uid()) or (select public.fishball_v2_is_admin()));

drop policy if exists "admins update post reports" on public.post_reports;
create policy "admins update post reports"
on public.post_reports for update to authenticated
using ((select public.fishball_v2_is_admin()))
with check ((select public.fishball_v2_is_admin()));

drop policy if exists "nobody deletes post reports" on public.post_reports;
create policy "nobody deletes post reports"
on public.post_reports for delete to authenticated
using (false);

create or replace function public.fishball_v2_create_post_report(
  target_post_id uuid,
  report_reason text,
  report_description text default null
)
returns public.post_reports
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  current_nickname text;
  current_post record;
  cleaned_reason text := btrim(coalesce(report_reason, ''));
  cleaned_description text := nullif(btrim(coalesce(report_description, '')), '');
  reports_last_minute integer := 0;
  result public.post_reports;
begin
  if current_user_id is null then
    raise exception '请先登录后再举报';
  end if;

  if cleaned_reason not in ('垃圾广告', '恶意刷帖', '不友善内容', '违法违规', '标题党 / 无意义内容', '其他') then
    raise exception '请选择举报原因';
  end if;

  if cleaned_description is not null and char_length(cleaned_description) > 300 then
    raise exception '补充说明不能超过 300 字';
  end if;

  select id, user_id, is_deleted
  into current_post
  from public.posts
  where id = target_post_id;

  if current_post.id is null then
    raise exception '帖子不存在';
  end if;

  if coalesce(current_post.is_deleted, false) then
    raise exception '已删除的帖子不能举报';
  end if;

  if current_post.user_id = current_user_id then
    raise exception '不能举报自己的帖子';
  end if;

  if exists (
    select 1
    from public.post_reports
    where post_id = target_post_id
      and reporter_id = current_user_id
  ) then
    raise exception '你已经举报过这篇帖子';
  end if;

  select count(*)
  into reports_last_minute
  from public.post_reports
  where reporter_id = current_user_id
    and created_at >= now() - interval '1 minute';

  if reports_last_minute >= 3 then
    raise exception '举报太频繁，请稍后再试';
  end if;

  select email
  into current_email
  from auth.users
  where id = current_user_id;

  select nickname
  into current_nickname
  from public.profiles
  where user_id = current_user_id;

  insert into public.post_reports (
    post_id,
    reporter_id,
    reporter_email,
    reporter_nickname,
    post_author_id,
    reason,
    description,
    status
  )
  values (
    target_post_id,
    current_user_id,
    current_email,
    current_nickname,
    current_post.user_id,
    cleaned_reason,
    cleaned_description,
    'pending'
  )
  returning * into result;

  return result;
exception
  when unique_violation then
    raise exception '你已经举报过这篇帖子';
end;
$$;

create or replace function public.fishball_v2_admin_update_post_report(
  target_report_id uuid,
  next_status text,
  next_admin_note text default null
)
returns public.post_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.post_reports;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  if not public.fishball_v2_is_admin() then
    raise exception 'admin role required';
  end if;

  if next_status not in ('pending', 'reviewing', 'resolved', 'rejected') then
    raise exception '举报状态不正确';
  end if;

  update public.post_reports
  set
    status = next_status,
    admin_note = nullif(btrim(coalesce(next_admin_note, '')), ''),
    reviewed_by = case when next_status in ('resolved', 'rejected') then auth.uid() else reviewed_by end,
    reviewed_at = case when next_status in ('resolved', 'rejected') then now() else reviewed_at end
  where id = target_report_id
  returning * into result;

  if result.id is null then
    raise exception '举报记录不存在';
  end if;

  return result;
end;
$$;

create or replace function public.fishball_v2_admin_post_report_action(
  target_report_id uuid,
  report_action text,
  next_admin_note text default null
)
returns public.post_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  current_report public.post_reports;
  result public.post_reports;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  if not public.fishball_v2_is_admin() then
    raise exception 'admin role required';
  end if;

  select *
  into current_report
  from public.post_reports
  where id = target_report_id;

  if current_report.id is null then
    raise exception '举报记录不存在';
  end if;

  if report_action = 'ignore' then
    update public.post_reports
    set status = 'rejected',
        admin_note = nullif(btrim(coalesce(next_admin_note, '')), ''),
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = target_report_id
    returning * into result;
    return result;
  end if;

  if report_action = 'resolve' then
    update public.post_reports
    set status = 'resolved',
        admin_note = nullif(btrim(coalesce(next_admin_note, '')), ''),
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = target_report_id
    returning * into result;
    return result;
  end if;

  if report_action = 'delete_post' then
    update public.posts
    set is_deleted = true,
        deleted_at = coalesce(deleted_at, now()),
        deleted_by = auth.uid()
    where id = current_report.post_id
      and coalesce(is_deleted, false) = false;

    update public.post_reports
    set status = 'resolved',
        admin_note = nullif(btrim(coalesce(next_admin_note, '')), ''),
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = target_report_id
    returning * into result;
    return result;
  end if;

  raise exception '举报处理动作不正确';
end;
$$;

revoke all on function public.fishball_v2_create_post_report(uuid, text, text) from public;
revoke all on function public.fishball_v2_admin_update_post_report(uuid, text, text) from public;
revoke all on function public.fishball_v2_admin_post_report_action(uuid, text, text) from public;

grant execute on function public.fishball_v2_create_post_report(uuid, text, text) to authenticated;
grant execute on function public.fishball_v2_admin_update_post_report(uuid, text, text) to authenticated;
grant execute on function public.fishball_v2_admin_post_report_action(uuid, text, text) to authenticated;
