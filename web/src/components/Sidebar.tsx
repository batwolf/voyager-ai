import { useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  ChevronLeft,
  ChevronRight,
  Clock,
  GitBranch,
  GripVertical,
  ListTodo,
  Moon,
  Plus,
  Radio,
  Satellite,
  Sun,
} from "lucide-react";
import type { SessionDTO } from "../types";
import { ATTENTION_STATUSES } from "../sessionUtils";
import { StatusBadge } from "./StatusBadge";

interface Props {
  sessions: SessionDTO[];
  selectedId: string | null;
  online: boolean;
  collapsed?: boolean;
  theme: "dark" | "light";
  notificationsOn: boolean;
  onSelect: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onNew: () => void;
  onQuickSwitcher: () => void;
  onToggleCollapse?: () => void;
  onToggleTheme: () => void;
  onToggleNotifications: () => void;
}

type Filter = "all" | "attention" | "running" | "exited";

function matchesFilter(s: SessionDTO, filter: Filter): boolean {
  const status = s.runtime.status;
  if (filter === "all") return true;
  if (filter === "attention") return ATTENTION_STATUSES.has(status);
  if (filter === "running") return status === "running" || status === "starting";
  if (filter === "exited") return status === "exited" || status === "error";
  return true;
}

export function Sidebar({
  sessions,
  selectedId,
  online,
  collapsed = false,
  theme,
  notificationsOn,
  onSelect,
  onReorder,
  onNew,
  onQuickSwitcher,
  onToggleCollapse,
  onToggleTheme,
  onToggleNotifications,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      attention: sessions.filter((s) => ATTENTION_STATUSES.has(s.runtime.status)).length,
      running: sessions.filter((s) => s.runtime.status === "running" || s.runtime.status === "starting").length,
      exited: sessions.filter((s) => s.runtime.status === "exited" || s.runtime.status === "error").length,
    }),
    [sessions]
  );

  const visible = useMemo(
    () => sessions.filter((s) => matchesFilter(s, filter)),
    [sessions, filter]
  );

  const clearDrag = () => {
    setDragId(null);
    setDropId(null);
  };

  if (collapsed) {
    return (
      <div className="sidebar sidebar-collapsed">
        <div className="sidebar-rail">
          <button className="btn ghost icon-only" onClick={onToggleCollapse} title="Expand sidebar">
            <ChevronRight size={16} />
          </button>
          <button className="btn ghost icon-only" onClick={onNew} title="New session">
            <Plus size={16} />
          </button>
          <button className="btn ghost icon-only" onClick={onQuickSwitcher} title="Quick switcher">
            <kbd>⌘K</kbd>
          </button>
          <div className="sidebar-rail-sessions">
            {sessions.slice(0, 12).map((s) => (
              <button
                key={s.id}
                className={`rail-session ${s.id === selectedId ? "active" : ""} st-${s.runtime.status}`}
                onClick={() => onSelect(s.id)}
                title={s.name}
              >
                <span className="rail-pip" />
                <span className="rail-letter">{s.name.charAt(0).toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <Satellite size={18} className="brand-icon" />
          <h1>Voyager AI</h1>
        </div>
        <div className="sidebar-header-actions">
          {onToggleCollapse && (
            <button className="btn ghost icon-only" onClick={onToggleCollapse} title="Collapse sidebar">
              <ChevronLeft size={16} />
            </button>
          )}
          <button className="btn ghost icon-only" onClick={onToggleTheme} title="Toggle theme">
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            className={`btn ghost icon-only ${notificationsOn ? "active-notif" : ""}`}
            onClick={onToggleNotifications}
            title={notificationsOn ? "Notifications on" : "Enable notifications"}
          >
            {notificationsOn ? <Bell size={15} /> : <BellOff size={15} />}
          </button>
          <button className="btn ghost icon-only kbd-btn" onClick={onQuickSwitcher} title="Quick switcher (⌘K)">
            <kbd>⌘K</kbd>
          </button>
          <div className="conn-status" title={online ? "Connected to server" : "Disconnected from server"}>
            <span className={`conn-dot ${online ? "online" : ""}`} />
            {online ? "Live" : "Offline"}
          </div>
        </div>
      </div>

      <div className="sidebar-toolbar">
        <button className="btn primary new-btn" onClick={onNew}>
          <Plus size={15} />
          New session
          <kbd className="kbd-inline">⌘N</kbd>
        </button>

        {sessions.length > 0 && (
          <div className="filter-tabs">
            <button
              className={`filter-tab ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              className={`filter-tab ${filter === "attention" ? "active" : ""}`}
              onClick={() => setFilter("attention")}
            >
              Attention
              {counts.attention > 0 && <span className="count">{counts.attention}</span>}
            </button>
            <button
              className={`filter-tab ${filter === "running" ? "active" : ""}`}
              onClick={() => setFilter("running")}
            >
              Active
              {counts.running > 0 && <span className="count">{counts.running}</span>}
            </button>
            <button
              className={`filter-tab ${filter === "exited" ? "active" : ""}`}
              onClick={() => setFilter("exited")}
            >
              Done
            </button>
          </div>
        )}
      </div>

      <div className="session-list">
        {sessions.length === 0 && (
          <div className="empty-sidebar">
            No sessions yet.
            <br />
            Start one to pilot your first agent.
          </div>
        )}
        {sessions.length > 0 && visible.length === 0 && (
          <div className="empty-sidebar">No sessions match this filter.</div>
        )}
        {visible.map((s, i) => {
          const todos = s.runtime.todos;
          const done = todos.filter((t) => t.status === "completed").length;
          const todoPct = todos.length > 0 ? (done / todos.length) * 100 : 0;
          const isDragging = dragId === s.id;
          const isDropTarget = dropId === s.id && dragId !== s.id;

          return (
            <div
              key={s.id}
              className={[
                "session-item",
                `st-${s.runtime.status}`,
                s.id === selectedId ? "active" : "",
                isDragging ? "dragging" : "",
                isDropTarget ? "drop-target" : "",
              ].join(" ")}
              onClick={() => onSelect(s.id)}
              onDragOver={(e) => {
                if (!dragId || dragId === s.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropId(s.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropId((current) => (current === s.id ? null : current));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fromId = dragId ?? e.dataTransfer.getData("text/plain");
                if (fromId && fromId !== s.id) onReorder(fromId, s.id);
                clearDrag();
              }}
            >
              <button
                type="button"
                className="session-drag-handle"
                draggable
                title="Drag to reorder"
                onClick={(e) => e.stopPropagation()}
                onDragStart={(e) => {
                  setDragId(s.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", s.id);
                }}
                onDragEnd={clearDrag}
              >
                <GripVertical size={14} />
              </button>

              <div className="session-item-body">
                <div className="session-row">
                  {i < 9 && <span className="session-shortcut">{i + 1}</span>}
                  <span className="session-name">{s.name}</span>
                  {s.provider && (
                    <span className={`provider-chip ${s.provider}`}>
                      {s.provider === "grok" ? "Grok" : "Claude"}
                    </span>
                  )}
                  <StatusBadge status={s.runtime.status} />
                </div>
                <div className="session-cwd">{s.worktree ? s.worktree.repoRoot : s.cwd}</div>
                {s.worktree && (
                  <div className="session-branch">
                    <span className="branch-chip" title={s.worktree.branch}>
                      <GitBranch size={10} />
                      {s.worktree.branch}
                    </span>
                  </div>
                )}
                <div className="session-meta">
                  {s.runtime.model && (
                    <span className="session-meta-item">
                      <Radio size={10} />
                      {s.runtime.model.replace("claude-", "")}
                    </span>
                  )}
                  {todos.length > 0 && (
                    <span className="todo-progress" title={`${done}/${todos.length} todos`}>
                      <ListTodo size={10} />
                      <span>
                        {done}/{todos.length}
                      </span>
                      <span className="todo-bar">
                        <span className="todo-bar-fill" style={{ width: `${todoPct}%` }} />
                      </span>
                    </span>
                  )}
                  {s.runtime.usage.total > 0 && (
                    <span className="session-meta-item">{formatTokens(s.runtime.usage.total)} tok</span>
                  )}
                  {s.runtime.lastActivity && (
                    <span className="session-meta-item">
                      <Clock size={10} />
                      {timeAgo(s.runtime.lastActivity)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}