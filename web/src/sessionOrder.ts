import type { SessionDTO } from "./types";

const STORAGE_KEY = "voyager-session-order";

export function loadSessionOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveSessionOrder(order: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    /* ignore quota errors */
  }
}

/** Keep saved order, drop removed sessions, append new ones at the end. */
export function mergeSessionOrder(saved: string[], sessionIds: string[]): string[] {
  const idSet = new Set(sessionIds);
  const next = saved.filter((id) => idSet.has(id));
  for (const id of sessionIds) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

export function applySessionOrder(sessions: SessionDTO[], order: string[]): SessionDTO[] {
  if (order.length === 0) return sessions;
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const ordered: SessionDTO[] = [];
  for (const id of order) {
    const session = byId.get(id);
    if (session) {
      ordered.push(session);
      byId.delete(id);
    }
  }
  for (const session of sessions) {
    if (byId.has(session.id)) ordered.push(session);
  }
  return ordered;
}

export function moveInOrder(order: string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return order;
  const next = order.filter((id) => id !== fromId);
  const targetIndex = next.indexOf(toId);
  if (targetIndex === -1) return order;
  next.splice(targetIndex, 0, fromId);
  return next;
}