import { createClient } from "@supabase/supabase-js";

export const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function setCorsHeaders(response, methods = "GET, POST, PATCH, DELETE, OPTIONS") {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", methods);
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

export function json(response, status, payload, methods) {
  setCorsHeaders(response, methods);
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

export function getAuthorization(request) {
  const value = request.headers.authorization || request.headers.Authorization;
  return typeof value === "string" ? value : "";
}

export function createAuthedClient(authorization) {
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

export async function requireAuthedClient(request) {
  const authorization = getAuthorization(request);
  if (!authorization.startsWith("Bearer ")) {
    return { error: "请先登录", status: 401 };
  }

  try {
    const client = createAuthedClient(authorization);
    const {
      data: { user },
      error,
    } = await client.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));

    if (error || !user) {
      return { error: "请先登录", status: 401 };
    }

    return { client, user };
  } catch {
    return { error: "服务暂时不可用", status: 500 };
  }
}

export async function requireAdmin(request) {
  const auth = await requireAuthedClient(request);
  if (auth.error) return auth;

  const { data, error } = await auth.client.rpc("fishball_v2_is_admin");
  if (error || data !== true) {
    return { error: "没有管理员权限", status: 403 };
  }

  return auth;
}

export function cleanBody(request) {
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

export function getPathParam(request, pattern) {
  const path = request.url?.split("?")[0] ?? "";
  const match = path.match(pattern);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function mapReportError(message, fallback = "操作失败，请稍后重试") {
  if (!message) return fallback;

  const knownMessages = [
    "请先登录后再举报",
    "请先登录",
    "请选择举报原因",
    "补充说明不能超过 300 字",
    "帖子不存在",
    "已删除的帖子不能举报",
    "不能举报自己的帖子",
    "你已经举报过这篇帖子",
    "举报太频繁，请稍后再试",
    "没有管理员权限",
    "举报记录不存在",
    "举报状态不正确",
    "举报处理动作不正确",
  ];

  return knownMessages.find((item) => message.includes(item)) ?? fallback;
}

export function reportStatusForError(message) {
  if (message.includes("请先登录")) return 401;
  if (message.includes("没有管理员权限")) return 403;
  if (message.includes("帖子不存在") || message.includes("举报记录不存在")) return 404;
  if (message.includes("你已经举报过这篇帖子")) return 409;
  if (message.includes("举报太频繁")) return 429;
  return 400;
}
