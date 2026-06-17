import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import {
  CLAUDE_BIN,
  CLAUDE_PROJECTS_DIR,
  GROK_BIN,
  GROK_SESSIONS_DIR,
  SHIM_DIR,
  SKIP_PERMISSIONS,
} from "./config.js";
import type { AgentProvider } from "./types.js";

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function pathPrefix(): string {
  return process.platform === "darwin" ? `PATH=${shellQuote(`${SHIM_DIR}:`)}"$PATH" ` : "";
}

const CLAUDE_STRIP_ENV = [
  "CLAUDECODE",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
  "CLAUDE_EFFORT",
  "AI_AGENT",
];

const GROK_STRIP_ENV = ["GROK_AGENT", "GROK_SUBAGENTS"];

export function normalizeProvider(value: unknown): AgentProvider {
  return value === "grok" ? "grok" : "claude";
}

export function providerLabel(provider: AgentProvider): string {
  return provider === "grok" ? "Grok" : "Claude";
}

export function encodeClaudeProjectDir(cwd: string): string {
  return cwd.replace(/[/.]/g, "-");
}

export function encodeGrokProjectDir(cwd: string): string {
  return encodeURIComponent(cwd);
}

export function expectedClaudeTranscriptPath(cwd: string, sessionId: string): string {
  return path.join(CLAUDE_PROJECTS_DIR, encodeClaudeProjectDir(cwd), `${sessionId}.jsonl`);
}

export function expectedGrokSessionDir(cwd: string, sessionId: string): string {
  return path.join(GROK_SESSIONS_DIR, encodeGrokProjectDir(cwd), sessionId);
}

export function expectedGrokTranscriptPath(cwd: string, sessionId: string): string {
  return path.join(expectedGrokSessionDir(cwd, sessionId), "chat_history.jsonl");
}

export function findClaudeTranscript(cwd: string, sessionId: string): string | null {
  const expected = expectedClaudeTranscriptPath(cwd, sessionId);
  if (fs.existsSync(expected)) return expected;

  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return null;
  for (const dir of fs.readdirSync(CLAUDE_PROJECTS_DIR)) {
    const candidate = path.join(CLAUDE_PROJECTS_DIR, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function findGrokTranscript(cwd: string, sessionId: string): string | null {
  const expected = expectedGrokTranscriptPath(cwd, sessionId);
  if (fs.existsSync(expected)) return expected;

  if (!fs.existsSync(GROK_SESSIONS_DIR)) return null;
  for (const dir of fs.readdirSync(GROK_SESSIONS_DIR)) {
    const candidate = path.join(GROK_SESSIONS_DIR, dir, sessionId, "chat_history.jsonl");
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function findTranscript(
  provider: AgentProvider,
  cwd: string,
  sessionId: string
): string | null {
  if (!sessionId) return null;
  return provider === "grok"
    ? findGrokTranscript(cwd, sessionId)
    : findClaudeTranscript(cwd, sessionId);
}

/** Discover a Grok session id for a cwd after Voyager launched the TUI. */
export function discoverGrokSessionId(cwd: string, afterMs: number): string | null {
  const activeFile = path.join(os.homedir(), ".grok", "active_sessions.json");
  try {
    const active = JSON.parse(fs.readFileSync(activeFile, "utf8")) as Array<{
      session_id?: string;
      cwd?: string;
      opened_at?: string;
    }>;
    const matches = active
      .filter((s) => s.cwd === cwd && s.session_id)
      .map((s) => ({
        id: s.session_id!,
        openedAt: s.opened_at ? Date.parse(s.opened_at) : 0,
      }))
      .filter((s) => !Number.isNaN(s.openedAt) && s.openedAt >= afterMs - 5000)
      .sort((a, b) => b.openedAt - a.openedAt);
    if (matches.length) return matches[0].id;
  } catch {
    /* ignore */
  }

  const projectDir = path.join(GROK_SESSIONS_DIR, encodeGrokProjectDir(cwd));
  if (!fs.existsSync(projectDir)) return null;

  const candidates: { id: string; mtime: number }[] = [];
  for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const summary = path.join(projectDir, entry.name, "summary.json");
    if (!fs.existsSync(summary)) continue;
    try {
      const stat = fs.statSync(summary);
      if (stat.mtimeMs >= afterMs - 5000) {
        candidates.push({ id: entry.name, mtime: stat.mtimeMs });
      }
    } catch {
      /* ignore */
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.id ?? null;
}

export function buildLaunchCommand(
  provider: AgentProvider,
  opts: { sessionId: string; name: string; resume: boolean; prompt?: string }
): string {
  const strip = provider === "grok" ? GROK_STRIP_ENV : CLAUDE_STRIP_ENV;
  const envPrefix = `env ${strip.map((v) => `-u ${v}`).join(" ")}`;
  const prefix = pathPrefix();

  if (provider === "grok") {
    const perms = SKIP_PERMISSIONS ? " --always-approve" : "";
    const resume = opts.resume && opts.sessionId ? ` --resume ${opts.sessionId}` : "";
    const prompt =
      !opts.resume && opts.prompt?.trim() ? ` ${shellQuote(opts.prompt.trim())}` : "";
    return `${envPrefix} ${prefix}${GROK_BIN}${resume}${perms}${prompt}`;
  }

  const flag = opts.resume ? `--resume ${opts.sessionId}` : `--session-id ${opts.sessionId}`;
  const perms = SKIP_PERMISSIONS ? " --dangerously-skip-permissions" : "";
  return `${envPrefix} ${prefix}${CLAUDE_BIN} ${flag} -n ${shellQuote(opts.name)}${perms}`;
}

export function tuiReady(capture: string, provider: AgentProvider): boolean {
  if (provider === "grok") return /grok|composer|build tui/i.test(capture) || capture.includes("│");
  return capture.includes("│") || /claude/i.test(capture);
}

export function formatModelName(model: string | undefined, provider: AgentProvider): string | undefined {
  if (!model) return undefined;
  if (provider === "grok") return model.replace(/^grok-/, "");
  return model.replace(/^claude-/, "");
}

export function commandExists(bin: string): boolean {
  try {
    execSync(`command -v ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function availableProviders(): AgentProvider[] {
  const out: AgentProvider[] = [];
  if (commandExists(CLAUDE_BIN)) out.push("claude");
  if (commandExists(GROK_BIN)) out.push("grok");
  return out;
}