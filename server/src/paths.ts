import fs from "node:fs";
import path from "node:path";
import { CLAUDE_PROJECTS_DIR } from "./config.js";

/**
 * Claude Code encodes a project's cwd into a directory name by replacing
 * path separators and dots with dashes, e.g.
 *   /Users/marc/Develop  ->  -Users-marc-Develop
 */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[/.]/g, "-");
}

export function expectedTranscriptPath(cwd: string, sessionId: string): string {
  return path.join(CLAUDE_PROJECTS_DIR, encodeProjectDir(cwd), `${sessionId}.jsonl`);
}

/**
 * Locate a session's transcript. We first try the encoded-cwd path; if it is
 * not there yet (encoding edge cases, or claude resolved a different cwd) we
 * fall back to scanning every project dir for `<sessionId>.jsonl`. The uuid is
 * globally unique, so this is unambiguous.
 */
export function findTranscript(cwd: string, sessionId: string): string | null {
  const expected = expectedTranscriptPath(cwd, sessionId);
  if (fs.existsSync(expected)) return expected;

  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return null;
  for (const dir of fs.readdirSync(CLAUDE_PROJECTS_DIR)) {
    const candidate = path.join(CLAUDE_PROJECTS_DIR, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
