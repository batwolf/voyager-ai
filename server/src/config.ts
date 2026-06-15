import os from "node:os";
import path from "node:path";

export const PORT = Number(process.env.MC_PORT ?? 8787);

/** Where claude writes per-project transcripts. */
export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

/** Local app data (persisted session registry, pipe-pane logs). */
export const DATA_DIR = process.env.MC_DATA_DIR ?? path.join(os.homedir(), ".mc");
export const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
export const PIPE_DIR = path.join(DATA_DIR, "pipes");
export const WORKTREE_DIR = path.join(DATA_DIR, "worktrees");

/** Path to the claude binary. Override with MC_CLAUDE_BIN if not on PATH. */
export const CLAUDE_BIN = process.env.MC_CLAUDE_BIN ?? "claude";

/**
 * Launch sessions with --dangerously-skip-permissions so they run unattended
 * without stalling on permission prompts. On by default; set
 * MC_SKIP_PERMISSIONS=0 to require manual approvals inside each session.
 */
export const SKIP_PERMISSIONS = process.env.MC_SKIP_PERMISSIONS !== "0";

/** Prefix for tmux sessions we own, so we never touch unrelated ones. */
export const TMUX_PREFIX = "mc_";

/** Default directory shown when browsing for a new session cwd. */
export const HOME_DIR = os.homedir();
