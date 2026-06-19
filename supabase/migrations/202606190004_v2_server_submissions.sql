-- FishBall V2 moderated server submissions.

create table if not exists public.server_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  server_name text not null check (char_length(btrim(server_name)) between 2 and 100),
  server_ip text not null check (char_length(btrim(server_ip)) between 3 and 255),
  description text not null check (char_length(btrim(description)) between 20 and 5000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  rejection_reason text check (
    rejection_reason is null or char_length(btrim(rejection_reason)) between 3 and 1000
  ),
  constraint submission_review_consistent check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null)
    or
    (status in ('approved', 'rejected') and reviewed_at is not null and reviewed_by is not null)
  )
);

create index if not exists server_submissions_user_id_idx
  on public.server_submissions (user_id);
create index if not exists server_submissions_pending_idx
  on public.server_submissions (created_at)
  where status = 'pending';
create unique index if not exists server_submissions_one_active_ip_idx
  on public.server_submissions (lower(server_ip))
  where status in ('pending', 'approved');

create or replace function public.protect_server_submission()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  recent_count integer;
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.status := 'pending';
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.rejection_reason := null;

    select count(*)
    into recent_count
    from public.server_submissions
    where user_id = auth.uid()
      and created_at >= now() - interval '24 hours';

    if recent_count >= 3 then
      raise exception 'submission rate limit exceeded: maximum 3 per 24 hours';
    end if;
  else
    if not public.fishball_v2_is_admin() then
      raise exception 'only admins may update submissions';
    end if;

    if new.id <> old.id
       or new.user_id <> old.user_id
       or new.server_name <> old.server_name
       or new.server_ip <> old.server_ip
       or new.description <> old.description
       or new.created_at <> old.created_at then
      raise exception 'immutable submission fields cannot be changed';
    end if;

    if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
      raise exception 'pending submissions can only be approved or rejected';
    end if;

    if new.status = 'rejected'
       and char_length(btrim(coalesce(new.rejection_reason, ''))) < 3 then
      raise exception 'rejection reason is required';
    end if;

    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
    new.rejection_reason := case
      when new.status = 'rejected' then btrim(new.rejection_reason)
      else null
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists server_submissions_protect on public.server_submissions;
create trigger server_submissions_protect
before insert or update on public.server_submissions
for each row execute function public.protect_server_submission();

alter table public.server_submissions enable row level security;

drop policy if exists "users read own submissions and admins read all" on public.server_submissions;
create policy "users read own submissions and admins read all"
on public.server_submissions for select to authenticated
using (user_id = (select auth.uid()) or (select public.fishball_v2_is_admin()));

drop policy if exists "authenticated users create submissions" on public.server_submissions;
create policy "authenticated users create submissions"
on public.server_submissions for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "admins update submissions" on public.server_submissions;
create policy "admins update submissions"
on public.server_submissions for update to authenticated
using ((select public.fishball_v2_is_admin()))
with check ((select public.fishball_v2_is_admin()));

create or replace function public.review_server_submission(
  target_submission_id uuid,
  decision text,
  reason text default null
)
returns public.server_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.server_submissions;
begin
  if auth.uid() is null or not public.fishball_v2_is_admin() then
    raise exception 'admin role required';
  end if;

  if decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;

  if decision = 'rejected' and char_length(btrim(coalesce(reason, ''))) < 3 then
    raise exception 'rejection reason is required';
  end if;

  update public.server_submissions
  set status = decision,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      rejection_reason = case when decision = 'rejected' then btrim(reason) else null end
  where id = target_submission_id
    and status = 'pending'
  returning * into result;

  if result.id is null then
    raise exception 'pending submission not found';
  end if;

  return result;
end;
$$;

revoke all on function public.review_server_submission(uuid, text, text) from public;
grant execute on function public.review_server_submission(uuid, text, text) to authenticated;
