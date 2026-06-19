-- FishBall V2 feedback queue.

create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 5 and 5000),
  status text not null default 'pending'
    check (status in ('pending', 'resolved')),
  priority text not null default 'normal'
    check (priority in ('normal', 'vip_high')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  constraint feedback_resolution_consistent check (
    (status = 'pending' and resolved_at is null and resolved_by is null)
    or
    (status = 'resolved' and resolved_at is not null and resolved_by is not null)
  )
);

create index if not exists feedbacks_user_id_idx on public.feedbacks (user_id);
create index if not exists feedbacks_pending_queue_idx
  on public.feedbacks (priority desc, created_at)
  where status = 'pending';

create or replace function public.prepare_feedback_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  new.status := 'pending';
  new.priority := case when public.is_vip() then 'vip_high' else 'normal' end;
  new.resolved_at := null;
  new.resolved_by := null;
  return new;
end;
$$;

drop trigger if exists feedbacks_prepare_insert on public.feedbacks;
create trigger feedbacks_prepare_insert
before insert on public.feedbacks
for each row execute function public.prepare_feedback_insert();

create or replace function public.protect_feedback_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.user_id <> old.user_id
     or new.message <> old.message
     or new.priority <> old.priority
     or new.created_at <> old.created_at then
    raise exception 'immutable feedback fields cannot be changed';
  end if;

  if old.status <> 'pending' or new.status <> 'resolved' then
    raise exception 'feedback can only transition from pending to resolved';
  end if;

  new.resolved_at := now();
  new.resolved_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists feedbacks_protect_update on public.feedbacks;
create trigger feedbacks_protect_update
before update on public.feedbacks
for each row execute function public.protect_feedback_update();

alter table public.feedbacks enable row level security;

drop policy if exists "users read own feedback and admins read all" on public.feedbacks;
create policy "users read own feedback and admins read all"
on public.feedbacks for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "authenticated users create feedback" on public.feedbacks;
create policy "authenticated users create feedback"
on public.feedbacks for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "admins update feedback" on public.feedbacks;
create policy "admins update feedback"
on public.feedbacks for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create or replace function public.resolve_feedback(target_feedback_id uuid)
returns public.feedbacks
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.feedbacks;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin role required';
  end if;

  update public.feedbacks
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = auth.uid()
  where id = target_feedback_id
    and status = 'pending'
  returning * into result;

  if result.id is null then
    raise exception 'pending feedback not found';
  end if;

  return result;
end;
$$;

revoke all on function public.resolve_feedback(uuid) from public;
grant execute on function public.resolve_feedback(uuid) to authenticated;
