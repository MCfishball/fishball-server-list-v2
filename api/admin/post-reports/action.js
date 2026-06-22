import {
  cleanBody,
  json,
  mapReportError,
  reportStatusForError,
  requireAdmin,
  setCorsHeaders,
} from "../../_fishball.js";

const allowedActions = new Set(["ignore", "resolve", "delete_post"]);

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

  const auth = await requireAdmin(request);
  if (auth.error) {
    return json(response, auth.status, { success: false, message: auth.error }, "POST, OPTIONS");
  }

  const body = cleanBody(request);
  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
  const adminNote = typeof body.admin_note === "string" ? body.admin_note : "";

  if (!id) {
    return json(response, 400, { success: false, message: "缺少举报 ID" }, "POST, OPTIONS");
  }

  if (!allowedActions.has(action)) {
    return json(response, 400, { success: false, message: "举报处理动作不正确" }, "POST, OPTIONS");
  }

  const { data, error } = await auth.client.rpc("fishball_v2_admin_post_report_action", {
    target_report_id: id,
    report_action: action,
    next_admin_note: adminNote || null,
  });

  if (error) {
    const message = mapReportError(error.message, "举报处理失败");
    return json(
      response,
      reportStatusForError(message),
      { success: false, message },
      "POST, OPTIONS",
    );
  }

  const message =
    action === "delete_post"
      ? "已删除被举报帖子，举报已标记为已处理"
      : action === "ignore"
        ? "举报已驳回"
        : "举报已标记为已处理";

  return json(response, 200, { success: true, message, report: data }, "POST, OPTIONS");
}
