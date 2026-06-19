-- Remove known prototype content and broadcast only real database changes.

begin;

delete from public.posts
where title in (
  'FishBall V2 更新公告：全新论坛体验与反作弊系统升级',
  '【生存】四季生存服 1.20.4 招募长期玩家',
  '村民交易价格突然变高了怎么办？',
  '今天在主城广场遇到的暖心事 ❤️',
  '关于领地插件 WorldGuard 的使用问题',
  '你们最喜欢的建筑风格是什么？',
  '服务器一直连接超时，求大佬看看',
  '史莱姆区块位置分享（1.20.4 实测可用）'
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
    ) then
      alter publication supabase_realtime add table public.posts;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
    ) then
      alter publication supabase_realtime add table public.comments;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_likes'
    ) then
      alter publication supabase_realtime add table public.post_likes;
    end if;
  end if;
end;
$$;

commit;
