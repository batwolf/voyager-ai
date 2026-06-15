import fs from "node:fs";
import { EventEmitter } from "node:events";
import { findTranscript } from "./paths.js";
import type { TodoItem, TokenUsage } from "./types.js";

export interface TranscriptState {
  model?: string;
  usage: TokenUsage;
  todos: TodoItem[];
  lastMessage?: string;
  lastActivity?: number;
  messageCount: number;
  toolCallCount: number;
  /** Type of the most recently appended transcript entry. */
  lastEntryType?: string;
  found: boolean;
}

function emptyUsage(): TokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 };
}

function textFromContent(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text as string);
    if (parts.length) return parts.join("\n");
  }
  return undefined;
}

/**
 * Tails a session's JSONL transcript, incrementally parsing appended lines
 * into a structured {@link TranscriptState}. Emits "update" on every change.
 */
export class TranscriptWatcher extends EventEmitter {
  readonly state: TranscriptState = {
    usage: emptyUsage(),
    todos: [],
    messageCount: 0,
    toolCallCount: 0,
    found: false,
  };

  private path: string | null = null;
  private offset = 0;
  private remainder = "";
  private watcher: fs.FSWatcher | null = null;
  private resolveTimer: NodeJS.Timeout | null = null;

  constructor(private readonly cwd: string, private readonly sessionId: string) {
    super();
  }

  start(): void {
    this.tryResolve();
  }

  private tryResolve(): void {
    const p = findTranscript(this.cwd, this.sessionId);
    if (p) {
      this.path = p;
      this.state.found = true;
      this.attach();
      this.readAppended();
    } else {
      // Transcript not written yet; poll until it appears.
      this.resolveTimer = setTimeout(() => this.tryResolve(), 750);
    }
  }

  private attach(): void {
    if (!this.path) return;
    try {
      this.watcher = fs.watch(this.path, () => this.readAppended());
    } catch {
      /* fall back to read-on-demand */
    }
  }

  private readAppended(): void {
    if (!this.path) return;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(this.path);
    } catch {
      return;
    }
    if (stat.size < this.offset) {
      // file truncated/rotated — restart
      this.offset = 0;
      this.remainder = "";
    }
    if (stat.size === this.offset) return;

    const fd = fs.openSync(this.path, "r");
    try {
      const len = stat.size - this.offset;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, this.offset);
      this.offset = stat.size;
      this.remainder += buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }

    const lines = this.remainder.split("\n");
    this.remainder = lines.pop() ?? "";
    let changed = false;
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        if (this.ingest(JSON.parse(line))) changed = true;
      } catch {
        /* skip malformed line */
      }
    }
    if (changed) this.emit("update", this.state);
  }

  private ingest(entry: any): boolean {
    const type = entry?.type as string | undefined;
    if (!type) return false;
    this.state.lastEntryType = type;
    let changed = true;

    if (typeof entry.timestamp === "string") {
      const t = Date.parse(entry.timestamp);
      if (!Number.isNaN(t)) this.state.lastActivity = t;
    }

    if (type === "assistant" && entry.message) {
      const msg = entry.message;
      this.state.messageCount++;
      if (msg.model) this.state.model = msg.model;
      this.applyUsage(msg.usage);
      const text = textFromContent(msg.content);
      if (text) this.state.lastMessage = text.slice(0, 2000);
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block?.type === "tool_use") {
            this.state.toolCallCount++;
            if (block.name === "TodoWrite" && Array.isArray(block.input?.todos)) {
              this.state.todos = block.input.todos.map((t: any) => ({
                content: String(t.content ?? ""),
                status: t.status ?? "pending",
                activeForm: t.activeForm,
              }));
            }
          }
        }
      }
    } else if (type === "user" && entry.message) {
      this.state.messageCount++;
      const text = textFromContent(entry.message.content);
      if (text) this.state.lastMessage = text.slice(0, 2000);
    } else {
      changed = false; // bookkeeping entries don't change derived state
      if (this.state.lastActivity) changed = true;
    }
    return changed;
  }

  private applyUsage(usage: any): void {
    if (!usage) return;
    const u = this.state.usage;
    u.input += usage.input_tokens ?? 0;
    u.output += usage.output_tokens ?? 0;
    u.cacheRead += usage.cache_read_input_tokens ?? 0;
    u.cacheCreation += usage.cache_creation_input_tokens ?? 0;
    u.total = u.input + u.output + u.cacheRead + u.cacheCreation;
  }

  stop(): void {
    if (this.resolveTimer) clearTimeout(this.resolveTimer);
    this.watcher?.close();
    this.watcher = null;
  }
}
