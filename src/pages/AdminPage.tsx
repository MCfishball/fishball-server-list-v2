import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, Flag, MessageSquareWarning, RefreshCw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import {
  AdminPostReport,
  AdminPostReportReason,
  AdminPostReportStatus,
  listAdminPostReports,
  runAdminPostReportAction,
  updateAdminPostReport,
} from "../lib/admin-post-reports-api";
import { getCurrentSession, onAuthSessionChange } from "../lib/supabase";

const statusOptions: { value: AdminPostReportStatus | "all"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待处理" },
  { value: "reviewing", label: "处理中" },
  { value: "resolved", label: "已处理" },
  { value: "rejected", label: "已驳回" },
];

const reasonOptions: { value: AdminPostReportReason | "all"; label: string }[] = [
  { value: "all", label: "全部原因" },
  { value: "垃圾广告", label: "垃圾广告" },
  { value: "恶意刷帖", label: "恶意刷帖" },
  { value: "不友善内容", label: "不友善内容" },
  { value: "违法违规", label: "违法违规" },
  { value: "标题党 / 无意义内容", label: "标题党 / 无意义内容" },
  { value: "其他", label: "其他" },
];

const statusText: Record<AdminPostReportStatus, string> = {
  pending: "待处理",
  reviewing: "处理中",
  resolved: "已处理",
  rejected: "已驳回",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AdminPage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionEmail, setSessionEmail] = useState("");
  const [reports, setReports] = useState<AdminPostReport[]>([]);
  const [statusFilter, setStatusFilter] = useState<AdminPostReportStatus | "all">("all");
  const [reasonFilter, setReasonFilter] = useState<AdminPostReportReason | "all">("all");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const loadReports = async () => {
    setLoading(true);
    setStatus("");
    try {
      const data = await listAdminPostReports({
        status: statusFilter,
        reason: reasonFilter,
      });
      setReports(data);
      setNotes((current) => {
        const next = { ...current };
        for (const report of data) {
          if (next[report.id] === undefined) next[report.id] = report.admin_note ?? "";
        }
        return next;
      });
    } catch (error) {
      setReports([]);
      setStatus(error instanceof Error ? error.message : "举报列表加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void getCurrentSession()
      .then((session) => {
        if (!active) return;
        setSessionEmail(session?.user.email ?? "");
      })
      .finally(() => {
        if (active) setSessionReady(true);
      });

    const unsubscribe = onAuthSessionChange((session) => {
      setSessionEmail(session?.user.email ?? "");
      setSessionReady(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    void loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady, statusFilter, reasonFilter]);

  const stats = useMemo(() => {
    return {
      pending: reports.filter((report) => report.status === "pending").length,
      reviewing: reports.filter((report) => report.status === "reviewing").length,
      resolved: reports.filter((report) => report.status === "resolved").length,
      rejected: reports.filter((report) => report.status === "rejected").length,
    };
  }, [reports]);

  const setReportStatus = async (report: AdminPostReport, nextStatus: AdminPostReportStatus) => {
    try {
      const message = await updateAdminPostReport({
        id: report.id,
        status: nextStatus,
        admin_note: notes[report.id] ?? "",
      });
      setStatus(message);
      await loadReports();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "举报状态更新失败");
    }
  };

  const runAction = async (report: AdminPostReport, action: "ignore" | "resolve" | "delete_post") => {
    if (action === "delete_post") {
      const confirmed = window.confirm("确认删除这篇被举报的帖子吗？此操作可能不可恢复。");
      if (!confirmed) return;
    }

    try {
      const message = await runAdminPostReportAction({
        id: report.id,
        action,
        admin_note: notes[report.id] ?? "",
      });
      setStatus(message);
      await loadReports();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "举报处理失败");
    }
  };

  const submitFilters = (event: FormEvent) => {
    event.preventDefault();
    void loadReports();
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <a className="brand" href="/forum" aria-label="Minecraft 论坛">
          <span className="brand-cube">F</span>
          <strong>Minecraft 论坛</strong>
          <span className="version">管理</span>
        </a>
        <nav>
          <a href="/forum">返回论坛</a>
          <a href="https://mcfishball.top">返回首页</a>
        </nav>
      </header>

      <main className="admin-content">
        <section className="module-intro">
          <ShieldCheck size={28} />
          <div>
            <h1>管理后台</h1>
            <p>论坛管理已放入后台管理内，管理员操作全部通过 /api/admin/* 校验。</p>
          </div>
        </section>

        <section className="admin-module-entry" aria-label="后台管理模块">
          <a className="active" href="/admin">
            <MessageSquareWarning size={17} />
            <span>论坛管理</span>
          </a>
        </section>

        <section className="admin-card">
          <div className="admin-card-heading">
            <div>
              <h2><MessageSquareWarning size={20} /> 论坛管理 · 帖子举报</h2>
              <p>当前账号：{sessionEmail || "未登录 / 正在恢复登录状态"}</p>
            </div>
            <button className="secondary-button" onClick={() => void loadReports()}>
              <RefreshCw size={15} /> 刷新
            </button>
          </div>

          <div className="admin-stats">
            <span>待处理 {stats.pending}</span>
            <span>处理中 {stats.reviewing}</span>
            <span>已处理 {stats.resolved}</span>
            <span>已驳回 {stats.rejected}</span>
          </div>

          <form className="admin-filters" onSubmit={submitFilters}>
            <label>
              状态
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AdminPostReportStatus | "all")}>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              原因
              <select value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value as AdminPostReportReason | "all")}>
                {reasonOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button className="primary-button">
              <Flag size={15} /> 筛选
            </button>
          </form>

          {status ? <p className="form-status admin-status" role="status">{status}</p> : null}

          {loading ? (
            <div className="empty-state">
              <RefreshCw size={34} />
              <h2>正在读取举报列表</h2>
              <p>数据只来自 Supabase post_reports 表。</p>
            </div>
          ) : reports.length ? (
            <div className="report-list">
              {reports.map((report) => (
                <article className={`report-card ${report.status}`} key={report.id}>
                  <div className="report-main">
                    <div className="report-title-row">
                      <span className="report-reason">{report.reason}</span>
                      <span className={`report-status ${report.status}`}>{statusText[report.status]}</span>
                    </div>
                    <h3>{report.post?.title ?? "帖子不存在或已不可见"}</h3>
                    <p>{report.description || "举报人未填写补充说明。"}</p>
                    <div className="report-meta">
                      <span>举报人：{report.reporter_nickname || "未设置昵称"}</span>
                      <span>{report.reporter_email || "无邮箱"}</span>
                      <span>帖子作者：{report.post?.author_nickname || report.post_author_id || "未知"}</span>
                      <span>{formatTime(report.created_at)}</span>
                      {report.post?.is_deleted ? <span className="danger-text">帖子已删除</span> : null}
                    </div>
                    <label className="admin-note-field">
                      管理员备注
                      <textarea
                        value={notes[report.id] ?? ""}
                        onChange={(event) =>
                          setNotes((current) => ({ ...current, [report.id]: event.target.value }))
                        }
                        placeholder="填写处理说明，仅管理员可见…"
                        rows={2}
                      />
                    </label>
                  </div>

                  <div className="report-actions">
                    <a className="secondary-button" href={`/forum/posts/${report.post_id}`} target="_blank" rel="noreferrer">
                      <Eye size={15} /> 查看原帖
                    </a>
                    <button className="secondary-button" onClick={() => void setReportStatus(report, "reviewing")}>
                      <RefreshCw size={15} /> 标记处理中
                    </button>
                    <button className="secondary-button" onClick={() => void runAction(report, "resolve")}>
                      <CheckCircle2 size={15} /> 标记已处理
                    </button>
                    <button className="secondary-button" onClick={() => void runAction(report, "ignore")}>
                      <XCircle size={15} /> 驳回举报
                    </button>
                    <button
                      className="danger-button"
                      onClick={() => void runAction(report, "delete_post")}
                      disabled={report.post?.is_deleted}
                    >
                      <Trash2 size={15} /> 删除被举报帖子
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Flag size={34} />
              <h2>暂无举报记录</h2>
              <p>切换筛选条件，或等待用户提交真实举报。</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
