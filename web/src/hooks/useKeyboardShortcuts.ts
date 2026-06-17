import { useEffect } from "react";
import type { SessionDTO } from "../types";
interface Handlers {
  /** Sessions in sidebar display order (used for ⌘1–9 shortcuts). */
  sessions: SessionDTO[];
  onNewSession: () => void;
  onQuickSwitcher: () => void;
  onStopSession: () => void;
  onSelectSession: (id: string) => void;
  onEscape: () => void;
}

export function useKeyboardShortcuts(handlers: Handlers) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (e.key === "Escape") {
        handlers.onEscape();
        return;
      }

      if (!mod) return;

      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        handlers.onQuickSwitcher();
        return;
      }

      // Allow other mod shortcuts even while typing in inputs.
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        handlers.onNewSession();
        return;
      }

      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        handlers.onStopSession();
        return;
      }

      if (/^[1-9]$/.test(e.key)) {
        const index = parseInt(e.key, 10) - 1;
        const session = handlers.sessions[index];
        if (session) {
          e.preventDefault();
          handlers.onSelectSession(session.id);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}