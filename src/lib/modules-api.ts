import { requireUserId, supabase } from "./supabase";

export type FeedbackRecord = {
  id: string;
  message: string;
  status: "pending" | "resolved";
  priority: "normal" | "vip_high";
  created_at: string;
};

export async function listMyFeedback(): Promise<FeedbackRecord[]> {
  if (!supabase) return [];
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("feedbacks")
    .select("id, message, status, priority, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as FeedbackRecord[];
}

export async function submitFeedback(message: string): Promise<FeedbackRecord> {
  if (!supabase) throw new Error("Supabase 尚未配置");
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("feedbacks")
    .insert({ user_id: userId, message })
    .select("id, message, status, priority, created_at")
    .single();
  if (error) throw error;
  return data as FeedbackRecord;
}

export type SubmissionRecord = {
  id: string;
  server_name: string;
  server_ip: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  rejection_reason: string | null;
};

export async function listMySubmissions(): Promise<SubmissionRecord[]> {
  if (!supabase) return [];
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("server_submissions")
    .select("id, server_name, server_ip, description, status, created_at, rejection_reason")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as SubmissionRecord[];
}

export async function submitServer(input: {
  serverName: string;
  serverIp: string;
  description: string;
}): Promise<SubmissionRecord> {
  if (!supabase) throw new Error("Supabase 尚未配置");
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("server_submissions")
    .insert({
      user_id: userId,
      server_name: input.serverName,
      server_ip: input.serverIp,
      description: input.description,
    })
    .select("id, server_name, server_ip, description, status, created_at, rejection_reason")
    .single();
  if (error) throw error;
  return data as SubmissionRecord;
}

