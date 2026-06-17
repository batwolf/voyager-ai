import { useCallback, useState } from "react";
import type { SessionDTO } from "../types";

const MAX_POINTS = 48;

export function useTokenHistory() {
  const [history, setHistory] = useState<Record<string, number[]>>({});

  const recordSession = useCallback((session: SessionDTO) => {
    const total = session.runtime.usage.total;
    setHistory((prev) => {
      const existing = prev[session.id] ?? [];
      if (existing.length > 0 && existing[existing.length - 1] === total) return prev;
      return {
        ...prev,
        [session.id]: [...existing, total].slice(-MAX_POINTS),
      };
    });
  }, []);

  const getHistory = useCallback((id: string) => history[id] ?? [], [history]);

  return { recordSession, getHistory };
}