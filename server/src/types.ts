export type SessionStatus =
  | "starting"
  | "running"
  | "waiting" // assistant idle, awaiting user input
  | "needs-input" // a permission / confirmation prompt is on screen
  | "idle"
  | "error"
  | "exited";

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  total: number;
}

/** Live, derived state pulled from the transcript + tmux. */
export interface SessionRuntime {
  status: SessionStatus;
  model?: string;
  todos: TodoItem[];
  usage: TokenUsage;
  lastMessage?: string;
  lastActivity?: number; // epoch ms
  messageCount: number;
  toolCallCount: number;
}

/** Git worktree backing a session, when isolation is enabled. */
export interface WorktreeInfo {
  path: string; // the worktree directory (where claude runs)
  branch: string; // mc/<name> branch checked out in the worktree
  repoRoot: string; // the source repository root
}

/** Persisted, identity-level metadata for a session. */
export interface SessionMeta {
  id: string; // short id used for tmux session name + UI key
  sessionId: string; // claude --session-id uuid
  name: string;
  cwd: string; // directory claude actually runs in (worktree path if isolated)
  sourceCwd: string; // directory the user originally picked
  createdAt: number;
  initialPrompt?: string;
  transcriptPath: string;
  worktree?: WorktreeInfo;
}

export interface SessionDTO extends SessionMeta {
  runtime: SessionRuntime;
  tmuxAlive: boolean;
}
