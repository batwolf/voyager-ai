import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, GitBranch, Play, Plus, RotateCw, Satellite, Square, Trash2, X } from "lucide-react";
import { api } from "./api";
import { MCSocket } from "./ws";
import type { AgentProvider, SessionDTO } from "./types";
import { Sidebar } from "./components/Sidebar";
import { StatusPanel } from "./components/StatusPanel";
import { SessionTerminal, type TerminalHandle, type TerminalSink } from "./components/SessionTerminal";
import { NewSessionModal } from "./components/NewSessionModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { SessionSwitcher } from "./components/SessionSwitcher";
import { TerminalToolbar } from "./components/TerminalToolbar";
import { MobileNav, type MobileTab } from "./components/MobileNav";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useTheme } from "./hooks/useTheme";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useTokenHistory } from "./hooks/useTokenHistory";
import { useSessionOrder } from "./hooks/useSessionOrder";
import {
  notificationsEnabled,
  requestNotificationPermission,
  setNotificationsEnabled,
  useAttentionAlerts,
} from "./hooks/useAttentionAlerts";
import { ATTENTION_STATUSES } from "./sessionUtils";
import { sessionBreadcrumbs } from "./utils/breadcrumbs";

type ConfirmState =
  | { kind: "remove"; id: string; name: string }
  | { kind: "force-remove"; id: string; name: string; message: string };

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const isMobile = useMediaQuery("(max-width: 860px)");
  const terminalRef = useRef<TerminalHandle>(null);
  const { recordSession, getHistory } = useTokenHistory();

  const [sessions, setSessions] = useState<SessionDTO[]>([]);
  const { orderedSessions, reorder } = useSessionOrder(sessions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; url?: string; error?: boolean } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("terminal");
  const [notifOn, setNotifOn] = useState(notificationsEnabled);

  const socketRef = useRef<MCSocket | null>(null);
  const sinkRef = useRef<TerminalSink | null>(null);

  useAttentionAlerts(sessions);

  useEffect(() => {
    if (!toast) return;
    const ms = toast.error ? 8000 : 5000;
    const t = window.setTimeout(() => setToast(null), ms);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const socket = new MCSocket();
    socketRef.current = socket;
    socket.connect({
      onOpen: () => setOnline(true),
      onClose: () => setOnline(false),
      onSessions: (list) => {
        setSessions(list);
        list.forEach(recordSession);
      },
      onStatus: (s) => {
        recordSession(s);
        setSessions((prev) => {
          const i = prev.findIndex((x) => x.id === s.id);
          if (i === -1) return [s, ...prev];
          const next = prev.slice();
          next[i] = s;
          return next;
        });
      },
      onOutput: (id, bytes) => {
        if (sinkRef.current?.id === id) sinkRef.current.write(bytes);
      },
      onClear: (id) => {
        if (sinkRef.current?.id === id) sinkRef.current.reset();
      },
    });
    return () => socket.close();
  }, [recordSession]);

  useEffect(() => {
    if (selectedId && !sessions.some((s) => s.id === selectedId)) setSelectedId(null);
    if (!selectedId && orderedSessions.length > 0) setSelectedId(orderedSessions[0].id);
  }, [sessions, orderedSessions, selectedId]);

  const registerSink = useCallback((sink: TerminalSink) => {
    sinkRef.current = sink;
  }, []);
  const unregisterSink = useCallback((id: string) => {
    if (sinkRef.current?.id === id) sinkRef.current = null;
  }, []);

  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId]
  );

  const attentionCount = useMemo(
    () => sessions.filter((s) => ATTENTION_STATUSES.has(s.runtime.status)).length,
    [sessions]
  );

  const selectSession = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (isMobile) setMobileTab("terminal");
    },
    [isMobile]
  );

  const createSession = async (body: {
    cwd: string;
    provider?: AgentProvider;
    name?: string;
    prompt?: string;
    isolate?: boolean;
    baseBranch?: string;
  }) => {
    const dto = await api.createSession(body);
    setSelectedId(dto.id);
    if (isMobile) setMobileTab("terminal");
  };

  const stop = async (id: string) => {
    await api.stopSession(id).catch(() => {});
  };
  const restart = async (id: string) => {
    await api.restartSession(id).catch(() => {});
  };

  const requestRemove = (id: string, name: string) => {
    setConfirm({ kind: "remove", id, name });
  };

  const executeRemove = async (id: string, force = false) => {
    setConfirmBusy(true);
    try {
      const res = await api.removeSession(id, force);
      if ("conflict" in res) {
        const c = res.conflict;
        setConfirm({
          kind: "force-remove",
          id,
          name: sessions.find((s) => s.id === id)?.name ?? "session",
          message: c.message ?? "This worktree has uncommitted changes.",
        });
        setConfirmBusy(false);
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setConfirm(null);
    } catch (e: any) {
      setToast({ text: String(e.message), error: true });
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    if (confirm.kind === "remove") await executeRemove(confirm.id);
    else await executeRemove(confirm.id, true);
  };

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => !v);
  }, []);

  const handleToggleNotifications = useCallback(async () => {
    if (notifOn) {
      setNotificationsEnabled(false);
      setNotifOn(false);
      return;
    }
    const ok = await requestNotificationPermission();
    setNotifOn(ok);
    if (!ok) setToast({ text: "Notifications blocked — enable in browser settings.", error: true });
  }, [notifOn]);

  const handleEscape = useCallback(() => {
    if (showSwitcher) setShowSwitcher(false);
    else if (showModal) setShowModal(false);
    else if (confirm && !confirmBusy) setConfirm(null);
    else if (toast) setToast(null);
  }, [showSwitcher, showModal, confirm, confirmBusy, toast]);

  const shortcutHandlers = useMemo(
    () => ({
      sessions: orderedSessions,
      onNewSession: () => setShowModal(true),
      onQuickSwitcher: () => setShowSwitcher(true),
      onStopSession: () => {
        if (selected && selected.runtime.status !== "exited") stop(selected.id);
      },
      onSelectSession: selectSession,
      onEscape: handleEscape,
    }),
    [orderedSessions, selected, handleEscape, selectSession]
  );

  useKeyboardShortcuts(shortcutHandlers);

  const sidebarProps = {
    sessions: orderedSessions,
    selectedId,
    online,
    collapsed: sidebarCollapsed,
    theme,
    notificationsOn: notifOn,
    onSelect: selectSession,
    onReorder: reorder,
    onNew: () => setShowModal(true),
    onQuickSwitcher: () => setShowSwitcher(true),
    onToggleCollapse: isMobile ? undefined : toggleSidebar,
    onToggleTheme: toggleTheme,
    onToggleNotifications: handleToggleNotifications,
  };

  const panelContent = selected ? (
    <StatusPanel session={selected} tokenHistory={getHistory(selected.id)} />
  ) : (
    <div className="panel">
      <h2>Status</h2>
      <div className="panel-empty">No session selected.</div>
    </div>
  );

  const mainContent = selected ? (
    <>
      <div className="main-header">
        <div className="main-header-left">
          <nav className="breadcrumbs" aria-label="Session path">
            {sessionBreadcrumbs(selected).map((crumb, i, arr) => (
              <span key={`${crumb}-${i}`} className="breadcrumb-item">
                {i > 0 && <ChevronRight size={12} className="breadcrumb-sep" />}
                <span className={i === arr.length - 1 ? "breadcrumb-current" : ""}>{crumb}</span>
              </span>
            ))}
          </nav>
          {selected.worktree && (
            <span className="branch-chip" title={`worktree: ${selected.worktree.path}`}>
              <GitBranch size={10} />
              {selected.worktree.branch}
            </span>
          )}
        </div>
        <div className="actions">
          {selected.runtime.status === "exited" ? (
            <button className="btn" onClick={() => restart(selected.id)} title="Resume session">
              <Play size={14} />
              Resume
            </button>
          ) : (
            <button className="btn" onClick={() => stop(selected.id)} title="Stop session (⌘W)">
              <Square size={14} />
              Stop
            </button>
          )}
          <button className="btn ghost" onClick={() => restart(selected.id)} title="Restart session">
            <RotateCw size={14} />
            Restart
          </button>
          <span className="actions-divider" />
          <button
            className="btn danger"
            onClick={() => requestRemove(selected.id, selected.name)}
            title="Remove session permanently"
          >
            <Trash2 size={14} />
            Remove
          </button>
        </div>
      </div>
      <TerminalToolbar terminalRef={terminalRef} />
      <div className="terminal-wrap">
        {socketRef.current && (
          <SessionTerminal
            ref={terminalRef}
            key={selected.id}
            id={selected.id}
            socket={socketRef.current}
            registerSink={registerSink}
            unregisterSink={unregisterSink}
          />
        )}
      </div>
    </>
  ) : (
    <div className="empty-main">
      <div className="empty-content">
        <Satellite size={48} className="empty-icon" strokeWidth={1.5} />
        <h2>Voyager AI</h2>
        <p>
          Pilot a fleet of Claude Code sessions from one dashboard. Select a session from the
          sidebar, or start a new one.
        </p>
        <button className="btn primary" onClick={() => setShowModal(true)}>
          <Plus size={15} />
          Start a session
        </button>
      </div>
    </div>
  );

  const overlays = (
    <>
      {showModal && <NewSessionModal onClose={() => setShowModal(false)} onCreate={createSession} />}
      <SessionSwitcher
        open={showSwitcher}
        sessions={orderedSessions}
        selectedId={selectedId}
        onOpenChange={setShowSwitcher}
        onSelect={selectSession}
        onNew={() => setShowModal(true)}
      />
      {confirm && (
        <ConfirmModal
          title={confirm.kind === "force-remove" ? "Discard worktree changes?" : "Remove session?"}
          message={
            confirm.kind === "force-remove"
              ? `${confirm.message}\n\nRemoving will permanently delete the tmux session and discard any uncommitted worktree changes.`
              : `Remove "${confirm.name}" permanently? This kills the tmux session and cannot be undone.`
          }
          confirmLabel={confirm.kind === "force-remove" ? "Remove anyway" : "Remove"}
          variant="danger"
          requireTyped={confirm.kind === "force-remove" ? "REMOVE" : undefined}
          busy={confirmBusy}
          onConfirm={handleConfirm}
          onCancel={() => !confirmBusy && setConfirm(null)}
        />
      )}
      {toast && (
        <div className={`toast ${toast.error ? "err" : ""}`}>
          <span>{toast.text}</span>
          {toast.url && (
            <a href={toast.url} target="_blank" rel="noreferrer">
              Open
            </a>
          )}
          <button className="btn ghost icon-only" onClick={() => setToast(null)} title="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );

  if (isMobile) {
    return (
      <div className="app-shell mobile">
        {!online && <ConnectionBanner />}
        <div className="mobile-content">
          {mobileTab === "sessions" && <Sidebar {...sidebarProps} collapsed={false} />}
          {mobileTab === "terminal" && <div className="main">{mainContent}</div>}
          {mobileTab === "status" && panelContent}
        </div>
        <MobileNav tab={mobileTab} attentionCount={attentionCount} onChange={setMobileTab} />
        {overlays}
      </div>
    );
  }

  return (
    <div className="app-shell">
      {!online && <ConnectionBanner />}

      <div className={`app-layout${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <aside className="layout-sidebar">
          <Sidebar {...sidebarProps} />
        </aside>
        <main className="layout-main">
          <div className="main">{mainContent}</div>
        </main>
        <aside className="layout-status">{panelContent}</aside>
      </div>

      {overlays}
    </div>
  );
}