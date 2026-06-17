import { useEffect, useRef } from "react";
import type { SessionDTO } from "../types";
import { ATTENTION_STATUSES } from "../sessionUtils";

const NOTIF_KEY = "voyager-notifications";

export function notificationsEnabled(): boolean {
  return localStorage.getItem(NOTIF_KEY) === "1";
}

export function setNotificationsEnabled(on: boolean) {
  localStorage.setItem(NOTIF_KEY, on ? "1" : "0");
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") {
    setNotificationsEnabled(true);
    return true;
  }
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  const ok = result === "granted";
  if (ok) setNotificationsEnabled(true);
  return ok;
}

export function useAttentionAlerts(sessions: SessionDTO[]) {
  const prevStatusRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const attention = sessions.filter((s) => ATTENTION_STATUSES.has(s.runtime.status)).length;
    const base = "Voyager AI";
    document.title = attention > 0 ? `(${attention}) ${base}` : base;
  }, [sessions]);

  useEffect(() => {
    if (!notificationsEnabled() || Notification.permission !== "granted") return;

    for (const s of sessions) {
      const prev = prevStatusRef.current[s.id];
      const cur = s.runtime.status;
      if (cur === "needs-input" && prev !== "needs-input") {
        const body = s.runtime.lastMessage?.slice(0, 120) || "Waiting for your response.";
        const n = new Notification(`${s.name} needs input`, {
          body,
          tag: `voyager-${s.id}`,
          silent: false,
        });
        n.onclick = () => window.focus();
      }
    }

    const next: Record<string, string> = {};
    for (const s of sessions) next[s.id] = s.runtime.status;
    prevStatusRef.current = next;
  }, [sessions]);
}