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
  is_deleted?: boolean;
  created_at: string;
  updated_at?: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

type DatabaseComment = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type ForumOfficialUser = {
  user_id: string;
  label: string | null;
};

export type ForumPostingLimits = {
  role: "user" | "vip" | "admin";
  dailyLimit: number | null;
  postsToday: number;
  remainingToday: number | null;
  cooldownSeconds: number;
  cooldownRemainingSeconds: number;
};

export type PostReportReason =
  | "垃圾广告"
  | "恶意刷帖"
  | "不友善内容"
  | "违法违规"
  | "标题党 / 无意义内容"
  | "其他";

export type MyPostReport = {
  id: string;
  post_id: string;
  reason: PostReportReason;
  description: string | null;
  status: "pending" | "reviewing" | "resolved" | "rejected";
  admin_note: string | null;
  created_at: string;
  updated_at: string;
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

function formatForumAuthor(baseAuthor: string, officialLabel?: string | null) {
  if (!officialLabel) return baseAuthor;
  if (baseAuthor.includes(officialLabel)) return baseAuthor;
  return `${baseAuthor} ${officialLabel}`;
}

function toPost(
  row: DatabasePost,
  comments: number,
  likes: number,
  author?: string,
  officialLabel?: string | null,
): Post {
  const baseAuthor = author || databaseAuthor(row.user_id);
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    content: row.content,
    category: categoryFromDb[row.category],
    tag: "社区",
    author: formatForumAuthor(baseAuthor, officialLabel),
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
    edited: Boolean(row.edited_at),
    official: Boolean(officialLabel),
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at ?? null,
  };
}

function normalizePostingLimits(value: unknown): ForumPostingLimits {
  const data = value as Partial<ForumPostingLimits> | null;
  const role = data?.role === "admin" || data?.role === "vip" ? data.role : "user";
  const dailyLimit =
    typeof data?.dailyLimit === "number" || data?.dailyLimit === null
      ? data.dailyLimit
      : role === "admin"
        ? null
        : role === "vip"
          ? 3
          : 1;

  return {
    role,
    dailyLimit,
    postsToday: typeof data?.postsToday === "number" ? data.postsToday : 0,
    remainingToday:
      typeof data?.remainingToday === "number" || data?.remainingToday === null
        ? data.remainingToday
        : dailyLimit === null
          ? null
          : dailyLimit,
    cooldownSeconds:
      typeof data?.cooldownSeconds === "number"
        ? data.cooldownSeconds
        : role === "admin"
          ? 0
          : role === "vip"
            ? 20
            : 60,
    cooldownRemainingSeconds:
      typeof data?.cooldownRemainingSeconds === "number" ? data.cooldownRemainingSeconds : 0,
  };
}

function postLimitExceededMessage(role: ForumPostingLimits["role"]) {
  if (role === "vip") return "VIP用户每天最多发布 3 个帖子";
  return "普通用户每天最多发布 1 个帖子，开通 VIP 可提升至 3 个";
}

function normalizePostCreateError(message: string) {
  if (message.includes("普通用户每天最多发布 1 个帖子")) {
    return "普通用户每天最多发布 1 个帖子，开通 VIP 可提升至 3 个";
  }

  if (message.includes("VIP用户每天最多发布 3 个帖子")) {
    return "VIP用户每天最多发布 3 个帖子";
  }

  if (message.includes("发帖太快了")) {
    return message;
  }

  return "发布失败，请稍后重试";
}

export async function getCurrentPostingLimits(): Promise<ForumPostingLimits> {
  if (!supabase) throw new Error("Supabase 尚未配置，发帖限制无法加载");
  await requireUserId();

  const { data, error } = await supabase.rpc("fishball_v2_get_posting_limits");
  if (error) throw error;

  return normalizePostingLimits(data);
}

export async function listPosts(): Promise<Post[]> {
  if (!supabase) throw new Error("Supabase 尚未配置，论坛无法加载");

  const { data: postRows, error } = await supabase
    .from("posts")
    .select("*")
    .eq("is_deleted", false)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  const posts = postRows as DatabasePost[];
  if (!posts.length) return [];

  const postIds = posts.map((post) => post.id);
  const authorIds = [...new Set(posts.map((post) => post.user_id))];
  const [
    { data: commentRows, error: commentError },
    { data: likeRows, error: likeError },
    { data: profileRows, error: profileError },
    { data: officialRows, error: officialError },
  ] = await Promise.all([
      supabase.from("comments").select("post_id").in("post_id", postIds),
      supabase.from("post_likes").select("post_id").in("post_id", postIds),
      supabase
        .from("profiles")
        .select("user_id,nickname")
        .in("user_id", authorIds),
      supabase
        .from("forum_official_users")
        .select("user_id,label")
        .in("user_id", authorIds),
    ]);

  if (commentError) throw commentError;
  if (likeError) throw likeError;
  if (profileError) throw profileError;
  if (officialError && officialError.code !== "42P01") throw officialError;

  const commentCounts = new Map<string, number>();
  const likeCounts = new Map<string, number>();
  const authors = new Map(
    (profileRows ?? []).map((profile) => [profile.user_id, profile.nickname as string | null]),
  );
  const officialLabels = new Map(
    ((officialRows ?? []) as ForumOfficialUser[]).map((row) => [row.user_id, row.label || "官方"]),
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
      officialLabels.get(post.user_id),
    ),
  );
}

export async function getPost(postId: string): Promise<Post> {
  if (!supabase) throw new Error("Supabase 尚未配置，帖子无法加载");

  const { data: postRow, error } = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();

  if (error) throw new Error("帖子加载失败");
  if (!postRow) throw new Error("帖子不存在");

  const post = postRow as DatabasePost;
  const [
    { data: commentRows, error: commentError },
    { data: likeRows, error: likeError },
    { data: profileRows, error: profileError },
    { data: officialRows, error: officialError },
  ] = await Promise.all([
    supabase.from("comments").select("post_id").eq("post_id", post.id),
    supabase.from("post_likes").select("post_id").eq("post_id", post.id),
    supabase.from("profiles").select("user_id,nickname").eq("user_id", post.user_id),
    supabase.from("forum_official_users").select("user_id,label").eq("user_id", post.user_id),
  ]);

  if (commentError) throw new Error("评论数量加载失败");
  if (likeError) throw new Error("点赞数量加载失败");
  if (profileError) throw new Error("作者资料加载失败");
  if (officialError && officialError.code !== "42P01") throw new Error("官方标识加载失败");

  const author = (profileRows ?? [])[0]?.nickname as string | null | undefined;
  const officialLabel = ((officialRows ?? []) as ForumOfficialUser[])[0]?.label ?? null;
  return toPost(post, commentRows?.length ?? 0, likeRows?.length ?? 0, author ?? undefined, officialLabel);
}

export async function createPost(input: Pick<Post, "title" | "content" | "category">) {
  if (!supabase) throw new Error("Supabase 尚未配置");
  const userId = await requireUserId();

  const limits = await getCurrentPostingLimits();
  if (limits.role !== "admin") {
    if ((limits.remainingToday ?? 0) <= 0) {
      throw new Error(postLimitExceededMessage(limits.role));
    }

    if (limits.cooldownRemainingSeconds > 0) {
      throw new Error(`发帖太快了，请等待 ${limits.cooldownRemainingSeconds} 秒后再发布`);
    }
  }

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

  if (error) throw new Error(normalizePostCreateError(error.message));
  return toPost(data as DatabasePost, 0, 0);
}

async function getAccessToken() {
  if (!supabase) throw new Error("Supabase 尚未配置");
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("请先登录");
  }

  return session.access_token;
}

function forumApiUrl(path: string) {
  if (typeof window !== "undefined" && /(^|\.)mcfishball\.top$/i.test(window.location.hostname)) {
    return `https://fishball-server-list-v2.vercel.app${path}`;
  }

  return path;
}

function cleanForumApiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function updatePost(
  postId: string,
  input: Pick<Post, "title" | "content">,
): Promise<Post> {
  const token = await getAccessToken();
  const response = await fetch(forumApiUrl(`/api/forum/posts/${encodeURIComponent(postId)}`), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    post?: DatabasePost;
  };

  if (!response.ok || !data.post) {
    throw new Error(data.error ?? "修改帖子失败");
  }

  return toPost(data.post, 0, 0);
}

export async function softDeletePost(postId: string) {
  const token = await getAccessToken();
  const response = await fetch(forumApiUrl(`/api/forum/posts/${encodeURIComponent(postId)}`), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(cleanForumApiError(data.error, "删除帖子失败"));
  }

  return data.message ?? "帖子已删除";
}

export async function reportPost(
  postId: string,
  input: { reason: PostReportReason; description?: string },
) {
  const token = await getAccessToken();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12000);
  const response = await fetch(
    forumApiUrl(`/api/forum/posts/${encodeURIComponent(postId)}/report`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: input.reason,
        description: input.description ?? "",
      }),
      signal: controller.signal,
    },
  ).catch((error) => {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("举报提交超时，请稍后再试");
    }
    throw error;
  }).finally(() => window.clearTimeout(timeoutId));

  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    report?: MyPostReport;
  };

  if (!response.ok || !data.success) {
    throw new Error(data.message ?? "举报提交失败，请稍后重试");
  }

  return data.message ?? "举报已提交，管理员会尽快处理";
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

export async function listCurrentUserReports(): Promise<Set<string>> {
  const token = await getAccessToken();
  const response = await fetch(forumApiUrl("/api/me/post-reports"), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    reports?: MyPostReport[];
  };

  if (!response.ok || !data.success) {
    throw new Error(data.message ?? "举报记录加载失败");
  }

  return new Set((data.reports ?? []).map((report) => report.post_id));
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
  official?: boolean;
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
  const commenterIds = [...new Set(comments.map((comment) => comment.user_id))];
  const [
    { data: profileRows, error: profileError },
    { data: officialRows, error: officialError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id,nickname")
      .in("user_id", commenterIds),
    supabase
      .from("forum_official_users")
      .select("user_id,label")
      .in("user_id", commenterIds),
  ]);
  if (profileError) throw profileError;
  if (officialError && officialError.code !== "42P01") throw officialError;
  const authors = new Map(
    (profileRows ?? []).map((profile) => [profile.user_id, profile.nickname as string | null]),
  );
  const officialLabels = new Map(
    ((officialRows ?? []) as ForumOfficialUser[]).map((row) => [row.user_id, row.label || "官方"]),
  );

  return comments.map((row) => ({
    id: row.id,
    author: formatForumAuthor(
      authors.get(row.user_id) || databaseAuthor(row.user_id),
      officialLabels.get(row.user_id),
    ),
    official: officialLabels.has(row.user_id),
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
