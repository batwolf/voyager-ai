import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { MCSocket } from "./ws";
import type { SessionDTO } from "./types";
import { Sidebar } from "./components/Sidebar";
import { StatusPanel } from "./components/StatusPanel";
import { SessionTerminal, type TerminalSink } from "./components/SessionTerminal";
import { NewSessionModal } from "./components/NewSessionModal";

export default function App() {
  const [sessions, setSessions] = useState<SessionDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState<{ text: string; url?: string; error?: boolean } | null>(null);

  const socketRef = useRef<MCSocket | null>(null);
  const sinkRef = useRef<TerminalSink | null>(null);

  // Single socket for the app lifetime; routes output to the active terminal.
  useEffect(() => {
    const socket = new MCSocket();
    socketRef.current = socket;
    socket.connect({
      onOpen: () => setOnline(true),
      onClose: () => setOnline(false),
      onSessions: (list) => setSessions(list),
      onStatus: (s) =>
        setSessions((prev) => {
          const i = prev.findIndex((x) => x.id === s.id);
          if (i === -1) return [s, ...prev];
          const next = prev.slice();
          next[i] = s;
          return next;
        }),
      onOutput: (id, bytes) => {
        if (sinkRef.current?.id === id) sinkRef.current.write(bytes);
      },
      onClear: (id) => {
        if (sinkRef.current?.id === id) sinkRef.current.reset();
      },
    });
    return () => socket.close();
  }, []);

  // Keep a sensible selection as sessions come and go.
  useEffect(() => {
    if (selectedId && !sessions.some((s) => s.id === selectedId)) setSelectedId(null);
    if (!selectedId && sessions.length > 0) setSelectedId(sessions[0].id);
  }, [sessions, selectedId]);

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

  const createSession = async (body: { cwd: string; name?: string; prompt?: string }) => {
    const dto = await api.createSession(body);
    setSelectedId(dto.id);
  };

  const stop = async (id: string) => {
    await api.stopSession(id).catch(() => {});
  };
  const restart = async (id: string) => {
    await api.restartSession(id).catch(() => {});
  };
  const remove = async (id: string, force = false) => {
    if (!force && !confirm("Remove this session permanently? This kills the tmux session.")) return;
    try {
      const res = await api.removeSession(id, force);
      if ("conflict" in res) {
        const c = res.conflict;
        if (confirm(`${c.message}\n\nRemove anyway and discard the worktree changes?`)) {
          await remove(id, true);
        }
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      setToast({ text: String(e.message), error: true });
    }
  };

  return (
    <div className="app">
      <Sidebar
        sessions={sessions}
        selectedId={selectedId}
        online={online}
        onSelect={setSelectedId}
        onNew={() => setShowModal(true)}
      />

      <div className="main">
        {selected ? (
          <>
            <div className="main-header">
              <span className="title">{selected.name}</span>
              {selected.worktree && (
                <span className="branch-chip" title={`worktree: ${selected.worktree.path}`}>
                  ⎇ {selected.worktree.branch}
                </span>
              )}
              <div className="actions">
                {selected.runtime.status === "exited" ? (
                  <button className="btn" onClick={() => restart(selected.id)}>
                    ⟳ Resume
                  </button>
                ) : (
                  <button className="btn" onClick={() => stop(selected.id)}>
                    ⏹ Stop
                  </button>
                )}
                <button className="btn" onClick={() => restart(selected.id)}>
                  ⟳ Restart
                </button>
                <button className="btn danger" onClick={() => remove(selected.id)}>
                  🗑 Remove
                </button>
              </div>
            </div>
            <div className="terminal-wrap">
              {socketRef.current && (
                <SessionTerminal
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
          <div className="empty">
            <div style={{ fontSize: 18 }}>🛰️ Voyager AI</div>
            <div>Select a session, or start a new one.</div>
          </div>
        )}
      </div>

      {selected ? (
        <StatusPanel session={selected} />
      ) : (
        <div className="panel">
          <h2>Status</h2>
          <div style={{ color: "var(--text-dim)", fontSize: 12 }}>No session selected.</div>
        </div>
      )}

      {showModal && <NewSessionModal onClose={() => setShowModal(false)} onCreate={createSession} />}

      {toast && (
        <div className={`toast ${toast.error ? "err" : ""}`}>
          <span>{toast.text}</span>
          {toast.url && (
            <a href={toast.url} target="_blank" rel="noreferrer">
              Open
            </a>
          )}
          <button className="btn" onClick={() => setToast(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
