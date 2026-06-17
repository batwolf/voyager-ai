import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { findSessionTranscript } from "./paths.js";
import { discoverGrokSessionId } from "./providers.js";
import type { AgentProvider, TodoItem, TokenUsage } from "./types.js";

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

function grokTextFromContent(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  return textFromContent(content);
}

/**
 * Tails a session's transcript, incrementally parsing appended lines
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
  private updatesPath: string | null = null;
  private offset = 0;
  private updatesOffset = 0;
  private remainder = "";
  private updatesRemainder = "";
  private watcher: fs.FSWatcher | null = null;
  private updatesWatcher: fs.FSWatcher | null = null;
  private resolveTimer: NodeJS.Timeout | null = null;
  private sessionId: string;

  constructor(
    private readonly provider: AgentProvider,
    private readonly cwd: string,
    sessionId: string,
    private readonly createdAt: number,
    private onSessionId?: (id: string) => void
  ) {
    super();
    this.sessionId = sessionId;
  }

  start(): void {
    this.tryResolve();
  }

  setSessionId(id: string): void {
    if (this.sessionId === id) return;
    this.sessionId = id;
    this.path = null;
    this.updatesPath = null;
    this.offset = 0;
    this.updatesOffset = 0;
    this.remainder = "";
    this.updatesRemainder = "";
    this.watcher?.close();
    this.updatesWatcher?.close();
    this.watcher = null;
    this.updatesWatcher = null;
    this.tryResolve();
  }

  private tryResolve(): void {
    if (this.provider === "grok" && !this.sessionId) {
      const discovered = discoverGrokSessionId(this.cwd, this.createdAt);
      if (discovered) {
        this.sessionId = discovered;
        this.onSessionId?.(discovered);
      } else {
        this.resolveTimer = setTimeout(() => this.tryResolve(), 750);
        return;
      }
    }

    const p = findSessionTranscript(this.provider, this.cwd, this.sessionId);
    if (p) {
      this.path = p;
      this.state.found = true;
      this.attach();
      this.readAppended();
      if (this.provider === "grok") {
        this.updatesPath = path.join(path.dirname(p), "updates.jsonl");
        this.attachUpdates();
        this.readUpdatesAppended();
      }
      return;
    }

    this.resolveTimer = setTimeout(() => this.tryResolve(), 750);
  }

  private attach(): void {
    if (!this.path) return;
    try {
      this.watcher = fs.watch(this.path, () => this.readAppended());
    } catch {
      /* fall back to read-on-demand */
    }
  }

  private attachUpdates(): void {
    if (!this.updatesPath) return;
    try {
      this.updatesWatcher = fs.watch(this.updatesPath, () => this.readUpdatesAppended());
    } catch {
      /* ignore */
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

  private readUpdatesAppended(): void {
    if (!this.updatesPath) return;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(this.updatesPath);
    } catch {
      return;
    }
    if (stat.size < this.updatesOffset) {
      this.updatesOffset = 0;
      this.updatesRemainder = "";
    }
    if (stat.size === this.updatesOffset) return;

    const fd = fs.openSync(this.updatesPath, "r");
    try {
      const len = stat.size - this.updatesOffset;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, this.updatesOffset);
      this.updatesOffset = stat.size;
      this.updatesRemainder += buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }

    const lines = this.updatesRemainder.split("\n");
    this.updatesRemainder = lines.pop() ?? "";
    let changed = false;
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        if (this.ingestGrokUpdate(JSON.parse(line))) changed = true;
      } catch {
        /* skip */
      }
    }
    if (changed) this.emit("update", this.state);
  }

  private ingest(entry: any): boolean {
    if (this.provider === "grok") return this.ingestGrokChat(entry);
    return this.ingestClaude(entry);
  }

  private ingestClaude(entry: any): boolean {
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
      this.applyClaudeUsage(msg.usage);
      const text = textFromContent(msg.content);
      if (text) this.state.lastMessage = text.slice(0, 2000);
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block?.type === "tool_use") {
            this.state.toolCallCount++;
            this.applyTodoTool(block.name, block.input);
          }
        }
      }
    } else if (type === "user" && entry.message) {
      this.state.messageCount++;
      const text = textFromContent(entry.message.content);
      if (text) this.state.lastMessage = text.slice(0, 2000);
    } else {
      changed = false;
      if (this.state.lastActivity) changed = true;
    }
    return changed;
  }

  private ingestGrokChat(entry: any): boolean {
    const type = entry?.type as string | undefined;
    if (!type || type === "system" || type === "reasoning" || type === "tool_result") {
      return false;
    }
    this.state.lastEntryType = type;
    let changed = true;

    if (type === "assistant") {
      this.state.messageCount++;
      if (entry.model_id) this.state.model = entry.model_id;
      const text = grokTextFromContent(entry.content);
      if (text) this.state.lastMessage = text.slice(0, 2000);
      if (Array.isArray(entry.tool_calls)) {
        for (const call of entry.tool_calls) {
          this.state.toolCallCount++;
          this.applyTodoTool(call.name, call.arguments);
        }
      }
    } else if (type === "user") {
      this.state.messageCount++;
      const text = grokTextFromContent(entry.content);
      if (text) this.state.lastMessage = text.slice(0, 2000);
    } else {
      changed = false;
    }
    return changed;
  }

  private ingestGrokUpdate(entry: any): boolean {
    const total = entry?.params?._meta?.totalTokens;
    if (typeof total !== "number" || total <= this.state.usage.total) return false;
    this.state.usage.total = total;
    this.state.usage.input = total;
    this.state.lastActivity = Date.now();
    const model = entry?.params?.update?.content?._meta?.modelId;
    if (typeof model === "string") this.state.model = model;
    return true;
  }

  private applyTodoTool(name: string | undefined, input: unknown): void {
    if (!name) return;
    const raw = typeof input === "string" ? tryParseJson(input) : input;
    if (name === "TodoWrite" && raw && Array.isArray((raw as any).todos)) {
      this.state.todos = (raw as any).todos.map((t: any) => ({
        content: String(t.content ?? ""),
        status: t.status ?? "pending",
        activeForm: t.activeForm,
      }));
    }
    if (name === "update_goal" && raw && Array.isArray((raw as any).todos)) {
      this.state.todos = (raw as any).todos.map((t: any) => ({
        content: String(t.content ?? t.id ?? ""),
        status: t.status ?? "pending",
        activeForm: t.activeForm,
      }));
    }
  }

  private applyClaudeUsage(usage: any): void {
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
    this.updatesWatcher?.close();
    this.watcher = null;
    this.updatesWatcher = null;
  }
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}