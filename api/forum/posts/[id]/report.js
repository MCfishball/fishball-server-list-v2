import {
  cleanBody,
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

  const { data, error } = await auth.client.rpc("fishball_v2_create_post_report", {
    target_post_id: postId,
    report_reason: reason,
    report_description: description || null,
  });

  if (error) {
    const message = mapReportError(error.message, "举报提交失败，请稍后重试");
    return json(
      response,
      reportStatusForError(message),
      { success: false, message },
      "POST, OPTIONS",
    );
  }

  return json(
    response,
    200,
    { success: true, message: "举报已提交，管理员会尽快处理", report: data },
    "POST, OPTIONS",
  );
}
