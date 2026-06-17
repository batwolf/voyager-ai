import fs from "node:fs";
import path from "node:path";
import { CLAUDE_PROJECTS_DIR, GROK_SESSIONS_DIR, HOME_DIR } from "./config.js";
import { encodeGrokProjectDir } from "./providers.js";

export interface BrowseResult {
  path: string;
  parent: string | null;
  dirs: { name: string; path: string }[];
}

/** List immediate subdirectories of a path for the new-session picker. */
export function browse(target?: string): BrowseResult {
  const dir = target ? path.resolve(target) : HOME_DIR;
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => ({ name: e.name, path: path.join(dir, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const parent = path.dirname(dir);
  return { path: dir, parent: parent === dir ? null : parent, dirs };
}

/**
 * Recently-used project directories, recovered from claude and grok session data.
 * Most-recently-modified first.
 */
export function recentProjects(limit = 12): string[] {
  const files: { file: string; mtime: number }[] = [];

  if (fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    for (const dir of fs.readdirSync(CLAUDE_PROJECTS_DIR)) {
      const full = path.join(CLAUDE_PROJECTS_DIR, dir);
      let jsonls: string[];
      try {
        jsonls = fs.readdirSync(full).filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }
      for (const j of jsonls) {
        const fp = path.join(full, j);
        try {
          files.push({ file: fp, mtime: fs.statSync(fp).mtimeMs });
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (fs.existsSync(GROK_SESSIONS_DIR)) {
    for (const dir of fs.readdirSync(GROK_SESSIONS_DIR)) {
      const full = path.join(GROK_SESSIONS_DIR, dir);
      let sessions: string[];
      try {
        sessions = fs
          .readdirSync(full, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch {
        continue;
      }
      for (const sessionId of sessions) {
        const summary = path.join(full, sessionId, "summary.json");
        if (!fs.existsSync(summary)) continue;
        try {
          files.push({ file: summary, mtime: fs.statSync(summary).mtimeMs });
        } catch {
          /* ignore */
        }
      }
    }
  }

  files.sort((a, b) => b.mtime - a.mtime);

  const seen = new Set<string>();
  const cwds: string[] = [];
  for (const { file } of files) {
    if (cwds.length >= limit) break;
    const cwd = cwdFromArtifact(file);
    if (cwd && !seen.has(cwd) && fs.existsSync(cwd)) {
      seen.add(cwd);
      cwds.push(cwd);
    }
  }
  return cwds;
}

function cwdFromArtifact(file: string): string | null {
  if (file.endsWith("summary.json")) {
    try {
      const summary = JSON.parse(fs.readFileSync(file, "utf8"));
      if (typeof summary.info?.cwd === "string") return summary.info.cwd;
    } catch {
      /* ignore */
    }
  }
  return firstCwd(file);
}

/** Read just enough of a claude transcript to recover the working directory. */
function firstCwd(file: string): string | null {
  let raw: string;
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    raw = buf.toString("utf8", 0, n);
  } catch {
    return null;
  }
  for (const line of raw.split("\n")) {
    if (!line.includes('"cwd"')) continue;
    try {
      const obj = JSON.parse(line);
      if (typeof obj.cwd === "string") return obj.cwd;
    } catch {
      /* partial last line */
    }
  }
  return null;
}

/** Decode a grok sessions directory name back to a cwd when possible. */
export function decodeGrokProjectDir(encoded: string): string | null {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export function grokProjectDir(cwd: string): string {
  return path.join(GROK_SESSIONS_DIR, encodeGrokProjectDir(cwd));
}