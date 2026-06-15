export type SessionStatus =
  | "starting"
  | "running"
  | "waiting"
  | "needs-input"
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

export interface SessionRuntime {
  status: SessionStatus;
  model?: string;
  todos: TodoItem[];
  usage: TokenUsage;
  lastMessage?: string;
  lastActivity?: number;
  messageCount: number;
  toolCallCount: number;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  repoRoot: string;
}

export interface SessionDTO {
  id: string;
  sessionId: string;
  name: string;
  cwd: string;
  sourceCwd: string;
  createdAt: number;
  initialPrompt?: string;
  transcriptPath: string;
  worktree?: WorktreeInfo;
  runtime: SessionRuntime;
  tmuxAlive: boolean;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  dirs: { name: string; path: string }[];
}

export interface GitInfo {
  isRepo: boolean;
  repoRoot?: string;
  currentBranch?: string;
  branches?: string[];
}

export interface MergeRequestResult {
  branch: string;
  base: string;
  committed: number;
  pushed: boolean;
  prCreated: boolean;
  url?: string;
  localMergeCommand?: string;
  message: string;
}
