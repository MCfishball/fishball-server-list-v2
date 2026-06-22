import {
  cleanBody,
  json,
  mapReportError,
  reportStatusForError,
  requireAdmin,
  setCorsHeaders,
} from "../_fishball.js";

const statusOrder = {
  pending: 0,
  reviewing: 1,
  resolved: 2,
  rejected: 3,
};

function getQueryValue(request, key) {
  const value = request.query?.[key];
  if (Array.isArray(value)) return value[0];
  if (value) return value;

  try {
    return new URL(request.url, "http://localhost").searchParams.get(key) ?? undefined;
  } catch {
    return undefined;
  }
}

async function enrichReports(client, reports) {
  const postIds = [...new Set(reports.map((report) => report.post_id).filter(Boolean))];
  const authorIds = [...new Set(reports.map((report) => report.post_author_id).filter(Boolean))];

  const [{ data: posts }, { data: authorProfiles }] = await Promise.all([
    postIds.length
      ? client.from("posts").select("id,title,user_id,is_deleted,deleted_at").in("id", postIds)
      : Promise.resolve({ data: [] }),
    authorIds.length
      ? client.from("profiles").select("user_id,nickname").in("user_id", authorIds)
      : Promise.resolve({ data: [] }),
  ]);

  const postsById = new Map((posts ?? []).map((post) => [post.id, post]));
  const authorsById = new Map(
    (authorProfiles ?? []).map((profile) => [profile.user_id, profile.nickname]),
  );

  return reports.map((report) => {
    const post = postsById.get(report.post_id);
    return {
      ...report,
      post: post
        ? {
            id: post.id,
            title: post.title,
            author_id: post.user_id,
            author_nickname: authorsById.get(post.user_id) ?? null,
            is_deleted: Boolean(post.is_deleted),
            deleted_at: post.deleted_at ?? null,
          }
        : {
            id: report.post_id,
            title: "帖子不存在或已不可见",
            author_id: report.post_author_id,
            author_nickname: authorsById.get(report.post_author_id) ?? null,
            is_deleted: true,
            deleted_at: null,
          },
    };
  });
}

export default async function handler(request, response) {
  setCorsHeaders(response, "GET, PATCH, OPTIONS");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  const auth = await requireAdmin(request);
  if (auth.error) {
    return json(response, auth.status, { success: false, message: auth.error }, "GET, PATCH, OPTIONS");
  }

  if (request.method === "GET") {
    const status = getQueryValue(request, "status");
    const reason = getQueryValue(request, "reason");

    let query = auth.client
      .from("post_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (status && status !== "all") query = query.eq("status", status);
    if (reason && reason !== "all") query = query.eq("reason", reason);

    const { data, error } = await query;
    if (error) {
      return json(response, 400, { success: false, message: "举报列表加载失败" }, "GET, PATCH, OPTIONS");
    }

    const reports = await enrichReports(auth.client, data ?? []);
    reports.sort((a, b) => {
      const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
      if (statusDiff !== 0) return statusDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return json(response, 200, { success: true, reports }, "GET, PATCH, OPTIONS");
  }

  if (request.method === "PATCH") {
    const body = cleanBody(request);
    const id = typeof body.id === "string" ? body.id : "";
    const status = typeof body.status === "string" ? body.status : "";
    const adminNote = typeof body.admin_note === "string" ? body.admin_note : "";

    if (!id) {
      return json(response, 400, { success: false, message: "缺少举报 ID" }, "GET, PATCH, OPTIONS");
    }

    const { data, error } = await auth.client.rpc("fishball_v2_admin_update_post_report", {
      target_report_id: id,
      next_status: status,
      next_admin_note: adminNote || null,
    });

    if (error) {
      const message = mapReportError(error.message, "举报状态更新失败");
      return json(
        response,
        reportStatusForError(message),
        { success: false, message },
        "GET, PATCH, OPTIONS",
      );
    }

    return json(response, 200, { success: true, message: "举报状态已更新", report: data }, "GET, PATCH, OPTIONS");
  }

  response.setHeader("Allow", "GET, PATCH");
  return json(response, 405, { success: false, message: "不支持的请求方法" }, "GET, PATCH, OPTIONS");
}
