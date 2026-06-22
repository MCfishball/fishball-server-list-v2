-- FishBall V2 forum author edit / soft delete.
-- Deletions are intentionally soft deletes so created posts still count toward daily posting limits.

alter table public.posts
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists edited_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists posts_visible_feed_idx
on public.posts (is_deleted, category, is_pinned desc, created_at desc);

create index if not exists posts_deleted_idx
on public.posts (is_deleted, deleted_at desc);

create or replace function public.fishball_v2_can_manage_post(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      target_user_id = auth.uid()
      or public.fishball_v2_is_admin()
    );
$$;

revoke all on function public.fishball_v2_can_manage_post(uuid) from public;
grant execute on function public.fishball_v2_can_manage_post(uuid) to authenticated;

create or replace function public.protect_post_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_soft_delete boolean;
  is_content_edit boolean;
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.created_at <> old.created_at then
    raise exception 'immutable post fields cannot be changed';
  end if;

  if old.is_deleted then
    raise exception '已删除帖子不能编辑';
  end if;

  if not public.fishball_v2_can_manage_post(old.user_id) then
    raise exception '你没有权限操作这个帖子';
  end if;

  is_soft_delete := new.is_deleted = true and old.is_deleted = false;
  is_content_edit := new.title is distinct from old.title or new.content is distinct from old.content;

  if is_soft_delete then
    new.is_deleted := true;
    new.deleted_at := now();
    new.deleted_by := auth.uid();
    new.updated_at := now();
    new.edited_at := old.edited_at;
    new.title := old.title;
    new.content := old.content;
    new.category := old.category;
    new.is_pinned := old.is_pinned;
    new.is_highlighted := old.is_highlighted;
    return new;
  end if;

  if new.deleted_at is distinct from old.deleted_at
     or new.deleted_by is distinct from old.deleted_by
     or new.is_deleted is distinct from old.is_deleted then
    raise exception 'delete fields can only be changed by soft delete';
  end if;

  if (new.is_pinned <> old.is_pinned or new.is_highlighted <> old.is_highlighted)
     and not (public.fishball_v2_is_vip() or public.fishball_v2_is_admin()) then
    raise exception 'VIP or admin role required for post promotion';
  end if;

  if is_content_edit then
    if char_length(btrim(new.title)) < 3 then
      raise exception '标题至少 3 个字';
    end if;

    if char_length(btrim(new.content)) < 10 then
      raise exception '内容至少 10 个字';
    end if;

    new.title := btrim(new.title);
    new.content := btrim(new.content);
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists posts_protect_fields on public.posts;
create trigger posts_protect_fields
before update on public.posts
for each row execute function public.protect_post_fields();

drop policy if exists "owners or admins update posts" on public.posts;
create policy "owners or admins update posts"
on public.posts for update to authenticated
using ((select public.fishball_v2_can_manage_post(user_id)))
with check ((select public.fishball_v2_can_manage_post(user_id)));

drop policy if exists "owners or admins delete posts" on public.posts;
create policy "owners or admins delete posts"
on public.posts for delete to authenticated
using (false);

create or replace function public.fishball_v2_update_post(
  target_post_id uuid,
  next_title text,
  next_content text
)
returns public.posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_post public.posts;
  result public.posts;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  if btrim(coalesce(next_title, '')) = '' or btrim(coalesce(next_content, '')) = '' then
    raise exception '标题和内容不能为空';
  end if;

  if char_length(btrim(next_title)) < 3 then
    raise exception '标题至少 3 个字';
  end if;

  if char_length(btrim(next_content)) < 10 then
    raise exception '内容至少 10 个字';
  end if;

  select * into current_post
  from public.posts
  where id = target_post_id;

  if current_post.id is null then
    raise exception '帖子不存在';
  end if;

  if current_post.is_deleted then
    raise exception '已删除帖子不能编辑';
  end if;

  if not public.fishball_v2_can_manage_post(current_post.user_id) then
    raise exception '你没有权限操作这个帖子';
  end if;

  update public.posts
  set title = btrim(next_title),
      content = btrim(next_content)
  where id = target_post_id
  returning * into result;

  return result;
end;
$$;

create or replace function public.fishball_v2_soft_delete_post(target_post_id uuid)
returns public.posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_post public.posts;
  result public.posts;
begin
  if auth.uid() is null then
    raise exception '请先登录';
  end if;

  select * into current_post
  from public.posts
  where id = target_post_id;

  if current_post.id is null then
    raise exception '帖子不存在';
  end if;

  if current_post.is_deleted then
    raise exception '帖子已删除';
  end if;

  if not public.fishball_v2_can_manage_post(current_post.user_id) then
    raise exception '你没有权限操作这个帖子';
  end if;

  update public.posts
  set is_deleted = true
  where id = target_post_id
  returning * into result;

  return result;
end;
$$;

revoke all on function public.fishball_v2_update_post(uuid, text, text) from public;
revoke all on function public.fishball_v2_soft_delete_post(uuid) from public;
grant execute on function public.fishball_v2_update_post(uuid, text, text) to authenticated;
grant execute on function public.fishball_v2_soft_delete_post(uuid) to authenticated;
