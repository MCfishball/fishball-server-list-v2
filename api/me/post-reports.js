import { json, requireAuthedClient, setCorsHeaders } from "../_fishball.js";

export default async function handler(request, response) {
  setCorsHeaders(response, "GET, OPTIONS");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return json(response, 405, { success: false, message: "不支持的请求方法" }, "GET, OPTIONS");
  }

  const auth = await requireAuthedClient(request);
  if (auth.error) {
    return json(response, auth.status, { success: false, message: auth.error }, "GET, OPTIONS");
  }

  const { data, error } = await auth.client
    .from("post_reports")
    .select("id, post_id, reason, description, status, admin_note, created_at, updated_at")
    .eq("reporter_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return json(response, 400, { success: false, message: "举报记录加载失败" }, "GET, OPTIONS");
  }

  return json(response, 200, { success: true, reports: data ?? [] }, "GET, OPTIONS");
}
