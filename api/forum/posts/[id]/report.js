import {
  cleanBody,
  getErrorMessage,
  getPathParam,
  json,
  mapReportError,
  reportStatusForError,
  requireAuthedClient,
  setCorsHeaders,
} from "../../../_fishball.js";

const allowedReasons = new Set([
  "垃圾广告",
  "恶意刷帖",
  "不友善内容",
  "违法违规",
  "标题党 / 无意义内容",
  "其他",
]);

function getPostId(request) {
  const raw = request.query?.id;
  if (Array.isArray(raw)) return raw[0];
  if (raw) return raw;
  return getPathParam(request, /\/api\/forum\/posts\/([^/]+)\/report$/);
}

function isMissingReportRpc(error) {
  const message = error?.message ?? "";
  return (
    message.includes("fishball_v2_create_post_report") &&
    (message.includes("does not exist") || message.includes("Could not find the function"))
  );
}

async function createReportWithoutRpc(client, user, postId, reason, description) {
  const { data: post, error: postError } = await client
    .from("posts")
    .select("id,user_id,is_deleted")
    .eq("id", postId)
    .maybeSingle();

  if (postError) throw postError;
  if (!post) throw new Error("帖子不存在");
  if (post.is_deleted) throw new Error("已删除的帖子不能举报");
  if (post.user_id === user.id) throw new Error("不能举报自己的帖子");

  const { data: existingReports, error: duplicateError } = await client
    .from("post_reports")
    .select("id")
    .eq("post_id", postId)
    .eq("reporter_id", user.id)
    .limit(1);

  if (duplicateError) throw duplicateError;
  if ((existingReports ?? []).length > 0) throw new Error("你已经举报过这篇帖子");

  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const { count, error: rateLimitError } = await client
    .from("post_reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", user.id)
    .gte("created_at", oneMinuteAgo);

  if (rateLimitError) throw rateLimitError;
  if ((count ?? 0) >= 3) throw new Error("举报太频繁，请稍后再试");

  const { data: profile } = await client
    .from("profiles")
    .select("nickname")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: report, error: insertError } = await client
    .from("post_reports")
    .insert({
      post_id: postId,
      reporter_id: user.id,
      reporter_email: user.email ?? null,
      reporter_nickname: profile?.nickname ?? null,
      post_author_id: post.user_id,
      reason,
      description: description || null,
      status: "pending",
    })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return report;
}

export default async function handler(request, response) {
  setCorsHeaders(response, "POST, OPTIONS");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { success: false, message: "不支持的请求方法" }, "POST, OPTIONS");
  }

  const auth = await requireAuthedClient(request);
  if (auth.error) {
    return json(response, auth.status, { success: false, message: auth.error }, "POST, OPTIONS");
  }

  const postId = getPostId(request);
  if (!postId) {
    return json(response, 400, { success: false, message: "缺少帖子 ID" }, "POST, OPTIONS");
  }

  const body = cleanBody(request);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (!allowedReasons.has(reason)) {
    return json(response, 400, { success: false, message: "请选择举报原因" }, "POST, OPTIONS");
  }

  if (description.length > 300) {
    return json(response, 400, { success: false, message: "补充说明不能超过 300 字" }, "POST, OPTIONS");
  }

  try {
    const report = await createReportWithoutRpc(
      auth.client,
      auth.user,
      postId,
      reason,
      description,
    );
    return json(
      response,
      200,
      { success: true, message: "举报已提交，管理员会尽快处理", report },
      "POST, OPTIONS",
    );
  } catch (insertError) {
    const insertMessage = getErrorMessage(insertError);
    if (!insertMessage.includes("post_reports")) {
      const message = mapReportError(insertMessage, "举报提交失败，请稍后重试");
      return json(
        response,
        reportStatusForError(message),
        { success: false, message },
        "POST, OPTIONS",
      );
    }

    const { data, error } = await auth.client.rpc("fishball_v2_create_post_report", {
      target_post_id: postId,
      report_reason: reason,
      report_description: description || null,
    });

    if (!error) {
      return json(
        response,
        200,
        { success: true, message: "举报已提交，管理员会尽快处理", report: data },
        "POST, OPTIONS",
      );
    }

    const message = mapReportError(
      isMissingReportRpc(error) ? insertMessage : error.message,
      "举报提交失败，请稍后重试",
    );
    return json(
      response,
      reportStatusForError(message),
      { success: false, message },
      "POST, OPTIONS",
    );
  }
}
