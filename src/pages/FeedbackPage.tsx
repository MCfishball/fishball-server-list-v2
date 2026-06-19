import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Clock3, Crown, MessageSquare, Send } from "lucide-react";
import { ModuleShell } from "../components/ModuleShell";
import {
  FeedbackRecord,
  listMyFeedback,
  submitFeedback,
} from "../lib/modules-api";
import { isSupabaseConfigured } from "../lib/supabase";

const demoFeedback: FeedbackRecord[] = [
  {
    id: "demo-feedback",
    message: "希望服务器详情页增加版本变更提醒。",
    status: "pending",
    priority: "vip_high",
    created_at: new Date().toISOString(),
  },
];

export function FeedbackPage() {
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState<FeedbackRecord[]>(
    isSupabaseConfigured ? [] : demoFeedback,
  );
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void listMyFeedback()
      .then(setRecords)
      .catch((error: Error) => setStatus(error.message));
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (message.trim().length < 5) return;
    setSubmitting(true);
    setStatus("");

    try {
      const record = isSupabaseConfigured
        ? await submitFeedback(message.trim())
        : {
            id: crypto.randomUUID(),
            message: message.trim(),
            status: "pending" as const,
            priority: "normal" as const,
            created_at: new Date().toISOString(),
          };
      setRecords((current) => [record, ...current]);
      setMessage("");
      setStatus("反馈已提交，管理员会尽快处理。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModuleShell active="feedback">
      <main className="module-content">
        <section className="module-intro">
          <MessageSquare size={28} />
          <div>
            <h1>反馈中心</h1>
            <p>提交产品建议或问题。VIP 反馈会由数据库自动提升优先级。</p>
          </div>
        </section>

        {!isSupabaseConfigured ? (
          <div className="integration-notice">
            当前为演示模式。配置 Supabase 环境变量后，表单会写入
            <code>feedbacks</code> 表。
          </div>
        ) : null}

        <div className="module-grid">
          <form className="module-form" onSubmit={handleSubmit}>
            <div className="form-heading">
              <h2>提交反馈</h2>
              <span><Crown size={14} /> VIP 优先支持</span>
            </div>
            <label>
              反馈内容
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="请描述问题、期望结果和复现步骤…"
                minLength={5}
                maxLength={5000}
                rows={9}
              />
            </label>
            <div className="form-submit-row">
              <span>{message.length} / 5000</span>
              <button
                className="primary-button"
                disabled={submitting || message.trim().length < 5}
              >
                <Send size={16} />
                {submitting ? "提交中…" : "提交反馈"}
              </button>
            </div>
            {status ? <p className="form-status" role="status">{status}</p> : null}
          </form>

          <section className="history-panel">
            <h2>我的反馈</h2>
            {records.length ? (
              records.map((record) => (
                <article className="history-row" key={record.id}>
                  <div className="history-icon">
                    {record.status === "resolved" ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Clock3 size={18} />
                    )}
                  </div>
                  <div>
                    <p>{record.message}</p>
                    <span>
                      {record.status === "resolved" ? "已解决" : "等待处理"}
                      {record.priority === "vip_high" ? " · VIP 高优先级" : ""}
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <p className="module-empty">暂无反馈记录。</p>
            )}
          </section>
        </div>
      </main>
    </ModuleShell>
  );
}

