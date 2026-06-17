import { CheckCircle2, Circle, CircleDashed } from "lucide-react";
import type { SessionDTO } from "../types";
import { StatusBadge } from "./StatusBadge";
import { formatTokens } from "./Sidebar";
import { CollapsibleSection } from "./CollapsibleSection";
import { Sparkline } from "./Sparkline";
import { MarkdownMessage } from "./MarkdownMessage";

interface Props {
  session: SessionDTO;
  tokenHistory?: number[];
}

export function StatusPanel({ session, tokenHistory = [] }: Props) {
  const { runtime } = session;
  const u = runtime.usage;
  const total = u.total || 1;

  return (
    <div className="panel">
      <CollapsibleSection id="status" title="Status" defaultOpen>
        <StatusBadge status={runtime.status} />
        <div style={{ marginTop: 12 }}>
          <div className="kv">
            <span className="k">Agent</span>
            <span>{session.provider === "grok" ? "Grok" : "Claude"}</span>
          </div>
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
      </CollapsibleSection>

      <CollapsibleSection id="tokens" title="Tokens" defaultOpen>
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
        {u.total > 0 && (
          <>
            <div className="token-bar">
              <div
                className="token-bar-seg input"
                style={{ width: `${(u.input / total) * 100}%` }}
              />
              <div
                className="token-bar-seg output"
                style={{ width: `${(u.output / total) * 100}%` }}
              />
              <div
                className="token-bar-seg cache"
                style={{ width: `${(u.cacheRead / total) * 100}%` }}
              />
            </div>
            <div className="token-legend">
              <span className="token-legend-item">
                <span className="token-legend-dot" style={{ background: "var(--accent)" }} />
                Input
              </span>
              <span className="token-legend-item">
                <span className="token-legend-dot" style={{ background: "var(--green)" }} />
                Output
              </span>
              <span className="token-legend-item">
                <span className="token-legend-dot" style={{ background: "var(--purple)" }} />
                Cache
              </span>
            </div>
          </>
        )}
        <div className="sparkline-wrap">
          <span className="lbl">Activity</span>
          <Sparkline data={tokenHistory} width={260} height={36} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="todos"
        title={`Todos (${runtime.todos.length})`}
        defaultOpen={runtime.todos.length > 0}
      >
        {runtime.todos.length === 0 && <div className="panel-empty">None</div>}
        {runtime.todos.map((t, i) => (
          <div key={i} className={`todo ${t.status}`}>
            <span className="box">
              {t.status === "completed" ? (
                <CheckCircle2 size={14} />
              ) : t.status === "in_progress" ? (
                <CircleDashed size={14} />
              ) : (
                <Circle size={14} />
              )}
            </span>
            <span>{t.status === "in_progress" && t.activeForm ? t.activeForm : t.content}</span>
          </div>
        ))}
      </CollapsibleSection>

      {runtime.lastMessage && (
        <CollapsibleSection id="last-message" title="Last message" defaultOpen>
          <MarkdownMessage content={runtime.lastMessage} className="last-msg" />
        </CollapsibleSection>
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