import { findTranscript as findByProvider } from "./providers.js";
import type { AgentProvider } from "./types.js";

export { expectedClaudeTranscriptPath, findClaudeTranscript } from "./providers.js";

/** @deprecated Use findTranscript(provider, cwd, sessionId) */
export function findTranscript(cwd: string, sessionId: string): string | null {
  return findByProvider("claude", cwd, sessionId);
}

export function findSessionTranscript(
  provider: AgentProvider,
  cwd: string,
  sessionId: string
): string | null {
  return findByProvider(provider, cwd, sessionId);
}