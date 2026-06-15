import type { SessionDTO } from "../types";
import { StatusBadge } from "./StatusBadge";
import { formatTokens } from "./Sidebar";

export function StatusPanel({ session }: { session: SessionDTO }) {
  const { runtime } = session;
  const u = runtime.usage;
  return (
    <div className="panel">
      <div className="panel-section">
        <h2>Status</h2>
        <StatusBadge status={runtime.status} />
        <div style={{ marginTop: 12 }}>
          <div className="kv">
            <span className="k">Model</span>
            <span>{runtime.model?.replace("claude-", "") ?? "—"}</span>
          </div>
          <div className="kv">
            <span className="k">Messages</span>
            <span>{runtime.messageCount}</span>
          </div>
          <div className="kv">
            <span className="k">Tool calls</span>
            <span>{runtime.toolCallCount}</span>
          </div>
          <div className="kv">
            <span className="k">Last activity</span>
            <span>{runtime.lastActivity ? timeAgo(runtime.lastActivity) : "—"}</span>
          </div>
        </div>
      </div>

      <div className="panel-section">
        <h2>Tokens</h2>
        <div className="stat-grid">
          <div className="stat">
            <div className="label">Total</div>
            <div className="value">{formatTokens(u.total)}</div>
          </div>
          <div className="stat">
            <div className="label">Output</div>
            <div className="value">{formatTokens(u.output)}</div>
          </div>
          <div className="stat">
            <div className="label">Input</div>
            <div className="value">{formatTokens(u.input)}</div>
          </div>
          <div className="stat">
            <div className="label">Cache read</div>
            <div className="value">{formatTokens(u.cacheRead)}</div>
          </div>
        </div>
      </div>

      <div className="panel-section">
        <h2>Todos ({runtime.todos.length})</h2>
        {runtime.todos.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 12 }}>None</div>}
        {runtime.todos.map((t, i) => (
          <div key={i} className={`todo ${t.status}`}>
            <span className="box">{t.status === "completed" ? "☑" : t.status === "in_progress" ? "◐" : "☐"}</span>
            <span>{t.status === "in_progress" && t.activeForm ? t.activeForm : t.content}</span>
          </div>
        ))}
      </div>

      {runtime.lastMessage && (
        <div className="panel-section">
          <h2>Last message</h2>
          <div className="last-msg">{runtime.lastMessage}</div>
        </div>
      )}
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
