import type { Post } from "../data";
import { requireUserId, supabase } from "./supabase";

type DatabasePost = {
  id: string;
  title: string;
  content: string;
  category: "servers_discussion" | "help" | "general_chat";
  is_pinned: boolean;
  is_highlighted: boolean;
  created_at: string;
  comments?: { count: number }[];
  post_likes?: { count: number }[];
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

function toPost(row: DatabasePost): Post {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: categoryFromDb[row.category],
    tag: "社区",
    author: "社区玩家",
    age: new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(row.created_at)),
    comments: row.comments?.[0]?.count ?? 0,
    likes: row.post_likes?.[0]?.count ?? 0,
    avatar: "🧑",
    pinned: row.is_pinned,
    highlighted: row.is_highlighted,
  };
}

export async function listPosts(): Promise<Post[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("posts")
    .select("*, comments(count), post_likes(count)")
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data as DatabasePost[]).map(toPost);
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
  return toPost(data as DatabasePost);
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

export type ForumComment = {
  id: string;
  author: string;
  body: string;
  age: string;
};

export async function listComments(postId: string): Promise<ForumComment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("comments")
    .select("id, content, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    author: "社区玩家",
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
    .select("id, content, created_at")
    .single();

  if (error) throw error;
  return {
    id: data.id,
    author: "FishBall_玩家",
    body: data.content,
    age: "刚刚",
  };
}

