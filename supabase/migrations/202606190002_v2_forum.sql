-- FishBall V2 forum. This migration is additive and does not modify existing tables.

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null
    check (category in ('servers_discussion', 'help', 'general_chat')),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  content text not null check (char_length(btrim(content)) between 1 and 20000),
  is_pinned boolean not null default false,
  is_highlighted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists posts_user_id_idx on public.posts (user_id);
create index if not exists posts_feed_idx
  on public.posts (category, is_pinned desc, created_at desc);
create index if not exists comments_post_created_idx
  on public.comments (post_id, created_at);
create index if not exists comments_user_id_idx on public.comments (user_id);
create index if not exists post_likes_user_id_idx on public.post_likes (user_id);

create or replace function public.fishball_v2_set_row_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.fishball_v2_set_row_updated_at();

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.fishball_v2_set_row_updated_at();

create or replace function public.protect_comment_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.post_id <> old.post_id
     or new.user_id <> old.user_id
     or new.created_at <> old.created_at then
    raise exception 'immutable comment fields cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_protect_fields on public.comments;
create trigger comments_protect_fields
before update on public.comments
for each row execute function public.protect_comment_fields();

create or replace function public.protect_post_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.created_at <> old.created_at then
    raise exception 'immutable post fields cannot be changed';
  end if;

  if (new.is_pinned <> old.is_pinned or new.is_highlighted <> old.is_highlighted)
     and not (public.fishball_v2_is_vip() or public.fishball_v2_is_admin()) then
    raise exception 'VIP or admin role required for post promotion';
  end if;

  return new;
end;
$$;

drop trigger if exists posts_protect_fields on public.posts;
create trigger posts_protect_fields
before update on public.posts
for each row execute function public.protect_post_fields();

alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;

drop policy if exists "posts readable by everyone" on public.posts;
create policy "posts readable by everyone"
on public.posts for select
using (true);

drop policy if exists "authenticated users create posts" on public.posts;
create policy "authenticated users create posts"
on public.posts for insert to authenticated
with check (
  user_id = (select auth.uid())
  and is_pinned = false
  and is_highlighted = false
);

drop policy if exists "owners or admins update posts" on public.posts;
create policy "owners or admins update posts"
on public.posts for update to authenticated
using (user_id = (select auth.uid()) or (select public.fishball_v2_is_admin()))
with check (user_id = (select auth.uid()) or (select public.fishball_v2_is_admin()));

drop policy if exists "owners or admins delete posts" on public.posts;
create policy "owners or admins delete posts"
on public.posts for delete to authenticated
using (user_id = (select auth.uid()) or (select public.fishball_v2_is_admin()));

drop policy if exists "comments readable by everyone" on public.comments;
create policy "comments readable by everyone"
on public.comments for select
using (true);

drop policy if exists "authenticated users create comments" on public.comments;
create policy "authenticated users create comments"
on public.comments for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "owners or admins update comments" on public.comments;
create policy "owners or admins update comments"
on public.comments for update to authenticated
using (user_id = (select auth.uid()) or (select public.fishball_v2_is_admin()))
with check (user_id = (select auth.uid()) or (select public.fishball_v2_is_admin()));

drop policy if exists "owners or admins delete comments" on public.comments;
create policy "owners or admins delete comments"
on public.comments for delete to authenticated
using (user_id = (select auth.uid()) or (select public.fishball_v2_is_admin()));

drop policy if exists "likes readable by everyone" on public.post_likes;
create policy "likes readable by everyone"
on public.post_likes for select
using (true);

drop policy if exists "users create own likes" on public.post_likes;
create policy "users create own likes"
on public.post_likes for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "users remove own likes" on public.post_likes;
create policy "users remove own likes"
on public.post_likes for delete to authenticated
using (user_id = (select auth.uid()));

-- Narrow RPC allows VIP/admin promotion of any post without granting broad UPDATE access.
create or replace function public.set_post_promotion(
  target_post_id uuid,
  pinned boolean,
  highlighted boolean
)
returns public.posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.posts;
begin
  if auth.uid() is null or not (public.fishball_v2_is_vip() or public.fishball_v2_is_admin()) then
    raise exception 'VIP or admin role required';
  end if;

  update public.posts
  set is_pinned = pinned,
      is_highlighted = highlighted
  where id = target_post_id
  returning * into result;

  if result.id is null then
    raise exception 'post not found';
  end if;

  return result;
end;
$$;

revoke all on function public.set_post_promotion(uuid, boolean, boolean) from public;
grant execute on function public.set_post_promotion(uuid, boolean, boolean) to authenticated;
