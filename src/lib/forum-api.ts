import type { Post } from "../data";
import { requireUserId, supabase } from "./supabase";

type DatabasePost = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: "servers_discussion" | "help" | "general_chat";
  is_pinned: boolean;
  is_highlighted: boolean;
  created_at: string;
};

type DatabaseComment = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

const categoryToDb = {
  服务器讨论: "servers_discussion",
  求助: "help",
  闲聊: "general_chat",
} as const;

const categoryFromDb = {
  servers_discussion: "服务器讨论",
  help: "求助",
  general_chat: "闲聊",
} as const;

function databaseAuthor(userId: string) {
  return `玩家${userId.replaceAll("-", "").slice(0, 4)}`;
}

function toPost(row: DatabasePost, comments: number, likes: number, author?: string): Post {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: categoryFromDb[row.category],
    tag: "社区",
    author: author || databaseAuthor(row.user_id),
    age: new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(row.created_at)),
    comments,
    likes,
    avatar: "🧑",
    pinned: row.is_pinned,
    highlighted: row.is_highlighted,
  };
}

export async function listPosts(): Promise<Post[]> {
  if (!supabase) throw new Error("Supabase 尚未配置，论坛无法加载");

  const { data: postRows, error } = await supabase
    .from("posts")
    .select("*")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  const posts = postRows as DatabasePost[];
  if (!posts.length) return [];

  const postIds = posts.map((post) => post.id);
  const [
    { data: commentRows, error: commentError },
    { data: likeRows, error: likeError },
    { data: profileRows, error: profileError },
  ] = await Promise.all([
      supabase.from("comments").select("post_id").in("post_id", postIds),
      supabase.from("post_likes").select("post_id").in("post_id", postIds),
      supabase
        .from("profiles")
        .select("user_id,nickname")
        .in("user_id", [...new Set(posts.map((post) => post.user_id))]),
    ]);

  if (commentError) throw commentError;
  if (likeError) throw likeError;
  if (profileError) throw profileError;

  const commentCounts = new Map<string, number>();
  const likeCounts = new Map<string, number>();
  const authors = new Map(
    (profileRows ?? []).map((profile) => [profile.user_id, profile.nickname as string | null]),
  );
  for (const row of commentRows ?? []) {
    commentCounts.set(row.post_id, (commentCounts.get(row.post_id) ?? 0) + 1);
  }
  for (const row of likeRows ?? []) {
    likeCounts.set(row.post_id, (likeCounts.get(row.post_id) ?? 0) + 1);
  }

  return posts.map((post) =>
    toPost(
      post,
      commentCounts.get(post.id) ?? 0,
      likeCounts.get(post.id) ?? 0,
      authors.get(post.user_id) ?? undefined,
    ),
  );
}

export async function createPost(input: Pick<Post, "title" | "content" | "category">) {
  if (!supabase) throw new Error("Supabase 尚未配置");
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: userId,
      title: input.title,
      content: input.content,
      category: categoryToDb[input.category],
    })
    .select("*")
    .single();

  if (error) throw error;
  return toPost(data as DatabasePost, 0, 0);
}

export async function setPostLike(postId: string, liked: boolean) {
  if (!supabase) throw new Error("Supabase 尚未配置");
  const userId = await requireUserId();

  if (liked) {
    const { error } = await supabase
      .from("post_likes")
      .upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id" });
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("post_likes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function listCurrentUserLikes(): Promise<Set<string>> {
  if (!supabase) throw new Error("Supabase 尚未配置，点赞状态无法加载");
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("post_likes")
    .select("post_id")
    .eq("user_id", userId);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.post_id));
}

export async function highlightPost(postId: string) {
  if (!supabase) throw new Error("Supabase 尚未配置");
  await requireUserId();
  const { error } = await supabase.rpc("set_post_promotion", {
    target_post_id: postId,
    pinned: false,
    highlighted: true,
  });

  if (error) throw error;
}

export type ForumComment = {
  id: string;
  author: string;
  body: string;
  age: string;
};

export async function listComments(postId: string): Promise<ForumComment[]> {
  if (!supabase) throw new Error("Supabase 尚未配置，评论无法加载");
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  const comments = data as DatabaseComment[];
  if (!comments.length) return [];
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("user_id,nickname")
    .in("user_id", [...new Set(comments.map((comment) => comment.user_id))]);
  if (profileError) throw profileError;
  const authors = new Map(
    (profileRows ?? []).map((profile) => [profile.user_id, profile.nickname as string | null]),
  );

  return comments.map((row) => ({
    id: row.id,
    author: authors.get(row.user_id) || databaseAuthor(row.user_id),
    body: row.content,
    age: new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(row.created_at)),
  }));
}

export async function createComment(postId: string, content: string): Promise<ForumComment> {
  if (!supabase) throw new Error("Supabase 尚未配置");
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("comments")
    .insert({ post_id: postId, user_id: userId, content })
    .select("*")
    .single();

  if (error) throw error;
  return {
    id: data.id,
    author: databaseAuthor(data.user_id),
    body: data.content,
    age: new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(data.created_at)),
  };
}

export function subscribeToForumChanges(onChange: () => void) {
  if (!supabase) return () => {};
  const client = supabase;

  const channel = client
    .channel("forum-database-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, onChange)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
