import type { SessionDTO, SessionStatus } from "./types";

export const STATUS_PRIORITY: Record<SessionStatus, number> = {
  "needs-input": 0,
  waiting: 1,
  starting: 2,
  running: 3,
  idle: 4,
  error: 5,
  exited: 6,
};

export const ATTENTION_STATUSES = new Set<SessionStatus>(["needs-input", "waiting"]);

export function sortSessions(list: SessionDTO[]): SessionDTO[] {
  return [...list].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.runtime.status];
    const pb = STATUS_PRIORITY[b.runtime.status];
    if (pa !== pb) return pa - pb;
    const ta = a.runtime.lastActivity ?? a.createdAt;
    const tb = b.runtime.lastActivity ?? b.createdAt;
    return tb - ta;
  });
}