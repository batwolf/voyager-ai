import type { SessionStatus } from "./types.js";

/** Heuristic markers that a confirmation / permission prompt is on screen. */
const PROMPT_MARKERS = [
  /Do you want to proceed/i,
  /Do you want to make this edit/i,
  /❯\s*1\.\s*Yes/,
  /\b1\.\s*Yes\b[\s\S]*\b2\.\s*No\b/,
  /Press\s+enter\s+to\s+continue/i,
];

export interface StatusInputs {
  tmuxAlive: boolean;
  msSinceOutput: number; // time since last raw pane output
  capture: string; // current visible pane text
  lastEntryType?: string;
  hasAnyMessage: boolean;
}

/**
 * Derive a coarse session status. Output activity is the primary signal (the
 * pane is actively painting => the agent is working); when quiet we inspect the
 * visible screen for a pending prompt, otherwise we treat it as waiting.
 */
export function deriveStatus(i: StatusInputs): SessionStatus {
  if (!i.tmuxAlive) return "exited";
  if (!i.hasAnyMessage && i.msSinceOutput < 4000) return "starting";

  if (PROMPT_MARKERS.some((re) => re.test(i.capture))) return "needs-input";

  // Actively painting the screen -> working.
  if (i.msSinceOutput < 1500) return "running";

  // Quiet. If we've seen conversation, the agent is idle awaiting the user.
  if (i.hasAnyMessage) return "waiting";

  return "idle";
}
