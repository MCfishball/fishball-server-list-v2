import { supabase } from "./supabase";

export type AdminPostReportStatus = "pending" | "reviewing" | "resolved" | "rejected";
export type AdminPostReportReason =
  | "垃圾广告"
  | "恶意刷帖"
  | "不友善内容"
  | "违法违规"
  | "标题党 / 无意义内容"
  | "其他";

export type AdminPostReport = {
  id: string;
  post_id: string;
  reporter_id: string;
  reporter_email: string | null;
  reporter_nickname: string | null;
  post_author_id: string | null;
  reason: AdminPostReportReason;
  description: string | null;
  status: AdminPostReportStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  post: {
    id: string;
    title: string;
    author_id: string | null;
    author_nickname: string | null;
    is_deleted: boolean;
    deleted_at: string | null;
  };
};

export type AdminPostReportFilter = {
  status?: AdminPostReportStatus | "all";
  reason?: AdminPostReportReason | "all";
};

async function getToken() {
  if (!supabase) throw new Error("Supabase 尚未配置");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("请先登录");
  return session.access_token;
}

function apiUrl(path: string) {
  if (typeof window !== "undefined" && /(^|\.)mcfishball\.top$/i.test(window.location.hostname)) {
    return `https://fishball-server-list-v2.vercel.app${path}`;
  }
  return path;
}

async function parseApiResponse<T>(response: Response, fallback: string): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    success?: boolean;
    message?: string;
  };

  if (!response.ok || data.success === false) {
    throw new Error(data.message ?? fallback);
  }

  return data;
}

export async function listAdminPostReports(
  filter: AdminPostReportFilter = {},
): Promise<AdminPostReport[]> {
  const token = await getToken();
  const params = new URLSearchParams();
  if (filter.status && filter.status !== "all") params.set("status", filter.status);
  if (filter.reason && filter.reason !== "all") params.set("reason", filter.reason);

  const response = await fetch(apiUrl(`/api/admin/post-reports?${params.toString()}`), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await parseApiResponse<{ reports?: AdminPostReport[] }>(
    response,
    "举报列表加载失败",
  );
  return data.reports ?? [];
}

export async function updateAdminPostReport(input: {
  id: string;
  status: AdminPostReportStatus;
  admin_note?: string;
}) {
  const token = await getToken();
  const response = await fetch(apiUrl("/api/admin/post-reports"), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = await parseApiResponse<{ message?: string; report?: AdminPostReport }>(
    response,
    "举报状态更新失败",
  );
  return data.message ?? "举报状态已更新";
}

export async function runAdminPostReportAction(input: {
  id: string;
  action: "ignore" | "resolve" | "delete_post";
  admin_note?: string;
}) {
  const token = await getToken();
  const response = await fetch(apiUrl("/api/admin/post-reports/action"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = await parseApiResponse<{ message?: string; report?: AdminPostReport }>(
    response,
    "举报处理失败",
  );
  return data.message ?? "举报处理成功";
}
