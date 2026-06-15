import type { SessionDTO } from "../types";
import { StatusBadge } from "./StatusBadge";

interface Props {
  sessions: SessionDTO[];
  selectedId: string | null;
  online: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function Sidebar({ sessions, selectedId, online, onSelect, onNew }: Props) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>Voyager AI</h1>
        <span className={`conn-dot ${online ? "online" : ""}`} title={online ? "Connected" : "Disconnected"} />
      </div>
      <button className="btn primary new-btn" onClick={onNew}>
        ＋ New session
      </button>
      <div className="session-list">
        {sessions.length === 0 && (
          <div style={{ padding: 16, color: "var(--text-dim)", fontSize: 12 }}>
            No sessions yet. Start one to get going.
          </div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`session-item ${s.id === selectedId ? "active" : ""}`}
            onClick={() => onSelect(s.id)}
          >
            <div className="session-row">
              <span className="session-name">{s.name}</span>
              <StatusBadge status={s.runtime.status} />
            </div>
            <div className="session-cwd">{s.worktree ? s.worktree.repoRoot : s.cwd}</div>
            {s.worktree && (
              <div className="session-branch">
                <span className="branch-chip" title={s.worktree.branch}>
                  ⎇ {s.worktree.branch}
                </span>
              </div>
            )}
            <div className="session-meta">
              {s.runtime.model && <span>{s.runtime.model.replace("claude-", "")}</span>}
              {s.runtime.todos.length > 0 && (
                <span>
                  ✓ {s.runtime.todos.filter((t) => t.status === "completed").length}/
                  {s.runtime.todos.length}
                </span>
              )}
              {s.runtime.usage.total > 0 && <span>{formatTokens(s.runtime.usage.total)} tok</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
