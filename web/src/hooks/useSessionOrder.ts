import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionDTO } from "../types";
import {
  applySessionOrder,
  loadSessionOrder,
  mergeSessionOrder,
  moveInOrder,
  saveSessionOrder,
} from "../sessionOrder";

export function useSessionOrder(sessions: SessionDTO[]) {
  const [order, setOrder] = useState<string[]>(() => loadSessionOrder());

  useEffect(() => {
    const ids = sessions.map((s) => s.id);
    setOrder((prev) => {
      const merged = mergeSessionOrder(prev, ids);
      if (merged.length === prev.length && merged.every((id, i) => id === prev[i])) return prev;
      saveSessionOrder(merged);
      return merged;
    });
  }, [sessions]);

  const orderedSessions = useMemo(
    () => applySessionOrder(sessions, order),
    [sessions, order]
  );

  const reorder = useCallback((fromId: string, toId: string) => {
    setOrder((prev) => {
      const next = moveInOrder(prev, fromId, toId);
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      saveSessionOrder(next);
      return next;
    });
  }, []);

  return { orderedSessions, reorder };
}