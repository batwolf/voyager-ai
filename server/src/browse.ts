import fs from "node:fs";
import path from "node:path";
import { CLAUDE_PROJECTS_DIR, HOME_DIR } from "./config.js";

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
 * Recently-used project directories, recovered from the `cwd` field stored in
 * existing claude transcripts. Most-recently-modified first.
 */
export function recentProjects(limit = 12): string[] {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];
  const files: { file: string; mtime: number }[] = [];
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
  files.sort((a, b) => b.mtime - a.mtime);

  const seen = new Set<string>();
  const cwds: string[] = [];
  for (const { file } of files) {
    if (cwds.length >= limit) break;
    const cwd = firstCwd(file);
    if (cwd && !seen.has(cwd) && fs.existsSync(cwd)) {
      seen.add(cwd);
      cwds.push(cwd);
    }
  }
  return cwds;
}

/** Read just enough of a transcript to recover the working directory. */
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
