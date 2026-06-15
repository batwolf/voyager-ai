import fs from "node:fs";
import { DATA_DIR, PIPE_DIR, SESSIONS_FILE } from "./config.js";
import type { SessionMeta } from "./types.js";

export function ensureDataDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PIPE_DIR, { recursive: true });
}

export function loadSessions(): SessionMeta[] {
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: SessionMeta[]): void {
  ensureDataDirs();
  const tmp = `${SESSIONS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2));
  fs.renameSync(tmp, SESSIONS_FILE);
}
