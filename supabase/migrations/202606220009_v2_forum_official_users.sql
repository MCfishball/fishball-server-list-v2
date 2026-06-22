-- FishBall V2 forum-only official author labels.
-- This does not modify global nickname/profile data; it only marks selected users for forum rendering.

create table if not exists public.forum_official_users (
  user_id uuid primary key,
  email text not null unique,
  label text not null default '官方',
  created_at timestamptz not null default now()
);

alter table public.forum_official_users
  add column if not exists user_id uuid,
  add column if not exists email text,
  add column if not exists label text not null default '官方',
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'forum_official_users_label_not_empty'
      and conrelid = 'public.forum_official_users'::regclass
  ) then
    alter table public.forum_official_users
      add constraint forum_official_users_label_not_empty
      check (char_length(btrim(label)) between 1 and 16);
  end if;
end $$;

create unique index if not exists forum_official_users_email_lower_uidx
on public.forum_official_users (lower(email));

alter table public.forum_official_users enable row level security;

drop policy if exists "forum official labels readable by everyone" on public.forum_official_users;
create policy "forum official labels readable by everyone"
on public.forum_official_users for select
using (true);

drop policy if exists "admins manage forum official labels" on public.forum_official_users;
create policy "admins manage forum official labels"
on public.forum_official_users for all to authenticated
using ((select public.fishball_v2_is_admin()))
with check ((select public.fishball_v2_is_admin()));

insert into public.forum_official_users (user_id, email, label)
select id, email, '官方'
from auth.users
where lower(email) = 'jiangyuze852@gmail.com'
on conflict (user_id) do update
set email = excluded.email,
    label = excluded.label;
