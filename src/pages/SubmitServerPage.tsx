import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Clock3, Send, Server, XCircle } from "lucide-react";
import { ModuleShell } from "../components/ModuleShell";
import {
  listMySubmissions,
  SubmissionRecord,
  submitServer,
} from "../lib/modules-api";
import { isSupabaseConfigured } from "../lib/supabase";

const demoSubmissions: SubmissionRecord[] = [
  {
    id: "demo-submission",
    server_name: "示例生存服务器",
    server_ip: "play.example.cn",
    description: "演示审核状态",
    status: "pending",
    created_at: new Date().toISOString(),
    rejection_reason: null,
  },
];

export function SubmitServerPage() {
  const [serverName, setServerName] = useState("");
  const [serverIp, setServerIp] = useState("");
  const [description, setDescription] = useState("");
  const [records, setRecords] = useState<SubmissionRecord[]>(
    isSupabaseConfigured ? [] : demoSubmissions,
  );
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void listMySubmissions()
      .then(setRecords)
      .catch((error: Error) => setStatus(error.message));
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      serverName.trim().length < 2 ||
      serverIp.trim().length < 3 ||
      description.trim().length < 20
    ) {
      return;
    }

    setSubmitting(true);
    setStatus("");
    try {
      const record = isSupabaseConfigured
        ? await submitServer({
            serverName: serverName.trim(),
            serverIp: serverIp.trim(),
            description: description.trim(),
          })
        : {
            id: crypto.randomUUID(),
            server_name: serverName.trim(),
            server_ip: serverIp.trim(),
            description: description.trim(),
            status: "pending" as const,
            created_at: new Date().toISOString(),
            rejection_reason: null,
          };
      setRecords((current) => [record, ...current]);
      setServerName("");
      setServerIp("");
      setDescription("");
      setStatus("服务器已提交，审核通过后才会进入服务器列表。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModuleShell active="submit">
      <main className="module-content">
        <section className="module-intro">
          <Server size={28} />
          <div>
            <h1>提交服务器</h1>
            <p>提交后进入管理员审核队列，不会直接写入现有服务器列表。</p>
          </div>
        </section>

        {!isSupabaseConfigured ? (
          <div className="integration-notice">
            当前为演示模式。配置 Supabase 后，表单会写入
            <code>server_submissions</code> 表。
          </div>
        ) : null}

        <div className="module-grid">
          <form className="module-form" onSubmit={handleSubmit}>
            <div className="form-heading">
              <h2>服务器资料</h2>
              <span>每个账号 24 小时最多 3 次</span>
            </div>
            <label>
              服务器名称
              <input
                value={serverName}
                onChange={(event) => setServerName(event.target.value)}
                placeholder="例如：FishBall 生存服"
                minLength={2}
                maxLength={100}
              />
            </label>
            <label>
              服务器地址
              <input
                value={serverIp}
                onChange={(event) => setServerIp(event.target.value)}
                placeholder="play.example.cn"
                minLength={3}
                maxLength={255}
              />
            </label>
            <label>
              服务器介绍
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="介绍玩法、版本、规则和社区特色（至少 20 字）…"
                minLength={20}
                maxLength={5000}
                rows={7}
              />
            </label>
            <div className="form-submit-row">
              <span>{description.length} / 5000</span>
              <button
                className="primary-button"
                disabled={
                  submitting ||
                  serverName.trim().length < 2 ||
                  serverIp.trim().length < 3 ||
                  description.trim().length < 20
                }
              >
                <Send size={16} />
                {submitting ? "提交中…" : "提交审核"}
              </button>
            </div>
            {status ? <p className="form-status" role="status">{status}</p> : null}
          </form>

          <section className="history-panel">
            <h2>审核状态</h2>
            {records.length ? (
              records.map((record) => (
                <article className="history-row" key={record.id}>
                  <div className={`history-icon ${record.status}`}>
                    {record.status === "approved" ? <CheckCircle2 size={18} /> : null}
                    {record.status === "pending" ? <Clock3 size={18} /> : null}
                    {record.status === "rejected" ? <XCircle size={18} /> : null}
                  </div>
                  <div>
                    <p>{record.server_name}</p>
                    <span>
                      {record.server_ip} ·{" "}
                      {record.status === "approved"
                        ? "已通过"
                        : record.status === "rejected"
                          ? "未通过"
                          : "审核中"}
                    </span>
                    {record.rejection_reason ? (
                      <small>{record.rejection_reason}</small>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <p className="module-empty">暂无服务器投稿。</p>
            )}
          </section>
        </div>
      </main>
    </ModuleShell>
  );
}

