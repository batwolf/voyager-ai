import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TMUX_PREFIX } from "./config.js";

const exec = promisify(execFile);

/** Run a tmux command, returning trimmed stdout. Throws on non-zero exit. */
async function tmux(args: string[]): Promise<string> {
  const { stdout } = await exec("tmux", args, { maxBuffer: 1024 * 1024 * 8 });
  return stdout;
}

/** tmux session name we own for a given app session id. */
export function tmuxName(id: string): string {
  return `${TMUX_PREFIX}${id}`;
}

/** Single-quote a string for safe embedding in a tmux shell-command. */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export async function hasTmux(): Promise<boolean> {
  try {
    await tmux(["-V"]);
    return true;
  } catch {
    return false;
  }
}

export async function sessionExists(id: string): Promise<boolean> {
  try {
    await tmux(["has-session", "-t", tmuxName(id)]);
    return true;
  } catch {
    return false;
  }
}

export async function listOwnedSessions(): Promise<string[]> {
  try {
    const out = await tmux(["list-sessions", "-F", "#{session_name}"]);
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.startsWith(TMUX_PREFIX))
      .map((s) => s.slice(TMUX_PREFIX.length));
  } catch {
    return []; // no server running yet
  }
}

export interface NewSessionOpts {
  id: string;
  cwd: string;
  command: string; // raw shell command to run inside the session
  cols?: number;
  rows?: number;
}

export async function newSession(opts: NewSessionOpts): Promise<void> {
  const name = tmuxName(opts.id);
  const cols = opts.cols ?? 120;
  const rows = opts.rows ?? 32;
  await tmux([
    "new-session",
    "-d",
    "-s",
    name,
    "-c",
    opts.cwd,
    "-x",
    String(cols),
    "-y",
    String(rows),
    opts.command,
  ]);
  // Let us drive the pane size from the browser instead of the client list.
  await tmux(["set-option", "-t", name, "window-size", "manual"]).catch(() => {});
}

export async function killSession(id: string): Promise<void> {
  try {
    await tmux(["kill-session", "-t", tmuxName(id)]);
  } catch {
    /* already gone */
  }
}

/** Begin mirroring the pane's raw output stream into a file. */
export async function pipePaneToFile(id: string, file: string): Promise<void> {
  await tmux(["pipe-pane", "-t", tmuxName(id), `cat >> ${shq(file)}`]);
}

/** Forward raw terminal bytes to the session as hex key codes (full fidelity). */
export async function sendRaw(id: string, data: Buffer | string): Promise<void> {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  if (buf.length === 0) return;
  const hex: string[] = [];
  for (const byte of buf) hex.push(byte.toString(16).padStart(2, "0"));
  await tmux(["send-keys", "-t", tmuxName(id), "-H", ...hex]);
}

/** Snapshot the current visible pane (with colours) to prime a fresh attach. */
export async function capturePane(id: string): Promise<string> {
  try {
    return await tmux(["capture-pane", "-t", tmuxName(id), "-p", "-e"]);
  } catch {
    return "";
  }
}

export async function resizeWindow(id: string, cols: number, rows: number): Promise<void> {
  const name = tmuxName(id);
  try {
    await tmux(["resize-window", "-t", name, "-x", String(cols), "-y", String(rows)]);
  } catch {
    /* session may have exited */
  }
}
