import type { AgentProvider, BrowseResult, GitInfo, MergeRequestResult, SessionDTO } from "./types";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  listSessions: (): Promise<SessionDTO[]> => fetch("/api/sessions").then(jsonOrThrow),

  providers: (): Promise<AgentProvider[]> => fetch("/api/providers").then(jsonOrThrow),

  createSession: (body: {
    cwd: string;
    provider?: AgentProvider;
    name?: string;
    prompt?: string;
    cols?: number;
    rows?: number;
    isolate?: boolean;
    baseBranch?: string;
  }): Promise<SessionDTO> =>
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(jsonOrThrow),

  stopSession: (id: string): Promise<SessionDTO> =>
    fetch(`/api/sessions/${id}/stop`, { method: "POST" }).then(jsonOrThrow),

  restartSession: (id: string): Promise<SessionDTO> =>
    fetch(`/api/sessions/${id}/restart`, { method: "POST" }).then(jsonOrThrow),

  /** Returns the 409 body ({error,message,worktreePath}) on dirty worktree. */
  removeSession: async (id: string, force = false): Promise<{ ok: true } | { conflict: any }> => {
    const res = await fetch(`/api/sessions/${id}${force ? "?force=1" : ""}`, { method: "DELETE" });
    if (res.status === 409) return { conflict: await res.json() };
    return jsonOrThrow(res);
  },

  mergeRequest: (
    id: string,
    body: { base?: string; title?: string; body?: string } = {}
  ): Promise<MergeRequestResult> =>
    fetch(`/api/sessions/${id}/merge-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(jsonOrThrow),

  browse: (path?: string): Promise<BrowseResult> =>
    fetch(`/api/browse${path ? `?path=${encodeURIComponent(path)}` : ""}`).then(jsonOrThrow),

  gitInfo: (path: string): Promise<GitInfo> =>
    fetch(`/api/gitinfo?path=${encodeURIComponent(path)}`).then(jsonOrThrow),

  recent: (): Promise<string[]> => fetch("/api/recent").then(jsonOrThrow),
};
