import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function json(response, status, payload) {
  setCorsHeaders(response);
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "PATCH, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

function getPostId(request) {
  const raw = request.query?.id;
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function getAuthorization(request) {
  const value = request.headers.authorization || request.headers.Authorization;
  return typeof value === "string" ? value : "";
}

function createAuthedClient(authorization) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 环境变量未配置");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      return {};
    }
  }
  return request.body;
}

function mapPostError(message, fallback) {
  if (!message) return fallback;

  if (message.includes("请先登录")) return "请先登录";
  if (message.includes("你没有权限操作这个帖子")) return "你没有权限操作这个帖子";
  if (message.includes("已删除帖子不能编辑")) return "已删除帖子不能编辑";
  if (message.includes("帖子不存在")) return "帖子不存在";
  if (message.includes("标题至少")) return "标题至少 3 个字";
  if (message.includes("内容至少")) return "内容至少 10 个字";
  if (message.includes("标题和内容不能为空")) return "标题和内容不能为空";
  if (message.includes("帖子已删除")) return "帖子已删除";

  return fallback;
}

function statusForError(errorMessage) {
  if (errorMessage === "请先登录") return 401;
  if (errorMessage === "你没有权限操作这个帖子") return 403;
  if (errorMessage === "帖子不存在") return 404;
  return 400;
}

export default async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  const postId = getPostId(request);
  const authorization = getAuthorization(request);

  if (!authorization.startsWith("Bearer ")) {
    return json(response, 401, { error: "请先登录" });
  }

  if (!postId) {
    return json(response, 400, { error: "缺少帖子 ID" });
  }

  let client;
  try {
    client = createAuthedClient(authorization);
  } catch {
    return json(response, 500, { error: "论坛服务暂时不可用" });
  }

  if (request.method === "PATCH") {
    const body = cleanBody(request);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!title || !content) {
      return json(response, 400, { error: "标题和内容不能为空" });
    }

    if (title.length < 3) {
      return json(response, 400, { error: "标题至少 3 个字" });
    }

    if (content.length < 10) {
      return json(response, 400, { error: "内容至少 10 个字" });
    }

    const { data, error } = await client.rpc("fishball_v2_update_post", {
      target_post_id: postId,
      next_title: title,
      next_content: content,
    });

    if (error) {
      const errorMessage = mapPostError(error.message, "修改帖子失败");
      return json(response, statusForError(errorMessage), { error: errorMessage });
    }

    return json(response, 200, { message: "修改成功", post: data });
  }

  if (request.method === "DELETE") {
    const { data, error } = await client.rpc("fishball_v2_soft_delete_post", {
      target_post_id: postId,
    });

    if (error) {
      const errorMessage = mapPostError(error.message, "删除帖子失败");
      return json(response, statusForError(errorMessage), { error: errorMessage });
    }

    return json(response, 200, { message: "帖子已删除", post: data });
  }

  response.setHeader("Allow", "PATCH, DELETE");
  return json(response, 405, { error: "不支持的请求方法" });
}
