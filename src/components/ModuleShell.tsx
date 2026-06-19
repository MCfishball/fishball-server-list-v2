import { MessageSquare, Plus, Server } from "lucide-react";
import type { ReactNode } from "react";

export function ModuleShell({
  active,
  children,
}: {
  active: "forum" | "feedback" | "submit";
  children: ReactNode;
}) {
  return (
    <div className="module-page">
      <header className="module-header">
        <a className="brand" href="/" aria-label="Minecraft 论坛首页">
          <span className="brand-cube">F</span>
          <strong>Minecraft 论坛</strong>
          <span className="version">V2</span>
        </a>
        <nav aria-label="V2 模块导航">
          <a className={active === "forum" ? "active" : ""} href="/forum">
            <MessageSquare size={17} /> 论坛
          </a>
          <a className={active === "feedback" ? "active" : ""} href="/feedback">
            <MessageSquare size={17} /> 反馈
          </a>
          <a className={active === "submit" ? "active" : ""} href="/submit-server">
            <Plus size={17} /> 提交服务器
          </a>
        </nav>
        <a className="back-to-v1" href="https://mcfishball.top">
          <Server size={16} /> 返回首页
        </a>
      </header>
      {children}
    </div>
  );
}
