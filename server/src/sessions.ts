import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { PIPE_DIR, WORKTREE_DIR } from "./config.js";
import { ensureBrowserShim } from "./browser-shim.js";
import { findSessionTranscript } from "./paths.js";
import {
  buildLaunchCommand,
  discoverGrokSessionId,
  normalizeProvider,
  tuiReady,
} from "./providers.js";
import {
  addWorktree,
  gitInfo,
  prepareMergeRequest,
  removeWorktree,
  worktreeHasChanges,
  type MergeRequestResult,
} from "./git.js";
import { TranscriptWatcher } from "./transcript.js";
import { deriveStatus } from "./status.js";
import { ensureDataDirs, loadSessions, saveSessions } from "./store.js";
import {
  capturePane,
  killSession,
  listOwnedSessions,
  newSession,
  pipePaneToFile,
  resizeWindow,
  sendRaw,
  sessionExists,
} from "./tmux.js";
import type {
  AgentProvider,
  SessionDTO,
  SessionMeta,
  SessionRuntime,
  SessionStatus,
  TokenUsage,
} from "./types.js";

interface LiveSession {
  meta: SessionMeta;
  transcript: TranscriptWatcher;
  pipeFile: string;
  lastOutputMs: number;
  status: SessionStatus;
  capture: string;
  pipeOffset: number;
  pipeWatcher: fs.FSWatcher | null;
}

export interface CreateOpts {
  cwd: string;
  name?: string;
  prompt?: string;
  provider?: AgentProvider;
  cols?: number;
  rows?: number;
  isolate?: boolean;
  baseBranch?: string;
}

/** Raised when removing a worktree-backed session that has uncommitted work. */
export class DirtyWorktreeError extends Error {
  constructor(public readonly worktreePath: string) {
    super("Worktree has uncommitted changes");
    this.name = "DirtyWorktreeError";
  }
}

function normalizeMeta(meta: SessionMeta): SessionMeta {
  return { ...meta, provider: normalizeProvider(meta.provider) };
}

/**
 * Owns the full lifecycle of tmux-backed agent sessions: spawning, raw I/O
 * mirroring, transcript-derived runtime state, and status polling.
 */
export class SessionManager extends EventEmitter {
  private sessions = new Map<string, LiveSession>();
  private poller: NodeJS.Timeout | null = null;

  async init(): Promise<void> {
    ensureDataDirs();
    ensureBrowserShim();
    const persisted = loadSessions().map(normalizeMeta);
    const owned = new Set(await listOwnedSessions());
    for (const meta of persisted) {
      if (owned.has(meta.id)) this.adopt(meta);
    }
    this.poller = setInterval(() => void this.poll(), 1000);
  }

  private persist(): void {
    saveSessions([...this.sessions.values()].map((s) => s.meta));
  }

  private register(meta: SessionMeta): LiveSession {
    const pipeFile = path.join(PIPE_DIR, `${meta.id}.out`);
    const transcript = new TranscriptWatcher(
      meta.provider,
      meta.cwd,
      meta.sessionId,
      meta.createdAt,
      (sessionId) => {
        meta.sessionId = sessionId;
        this.persist();
      }
    );
    const live: LiveSession = {
      meta,
      transcript,
      pipeFile,
      lastOutputMs: Date.now(),
      status: "starting",
      capture: "",
      pipeOffset: 0,
      pipeWatcher: null,
    };
    transcript.on("update", () => this.emit("status", meta.id));
    transcript.start();
    this.sessions.set(meta.id, live);
    return live;
  }

  private adopt(meta: SessionMeta): void {
    const live = this.register(meta);
    void this.startPipe(live);
  }

  private async startPipe(live: LiveSession): Promise<void> {
    try {
      fs.writeFileSync(live.pipeFile, "");
    } catch {
      /* ignore */
    }
    live.pipeOffset = 0;
    await pipePaneToFile(live.meta.id, live.pipeFile);
    this.tailPipe(live);
  }

  private tailPipe(live: LiveSession): void {
    const read = () => {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(live.pipeFile);
      } catch {
        return;
      }
      if (stat.size <= live.pipeOffset) return;
      const fd = fs.openSync(live.pipeFile, "r");
      try {
        const len = stat.size - live.pipeOffset;
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, live.pipeOffset);
        live.pipeOffset = stat.size;
        live.lastOutputMs = Date.now();
        this.emit("output", live.meta.id, buf);
      } finally {
        fs.closeSync(fd);
      }
    };
    try {
      live.pipeWatcher = fs.watch(live.pipeFile, read);
    } catch {
      /* ignore */
    }
    read();
  }

  async create(opts: CreateOpts): Promise<SessionDTO> {
    const cwd = path.resolve(opts.cwd);
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      throw new Error(`Not a directory: ${cwd}`);
    }

    const provider = normalizeProvider(opts.provider);
    const id = crypto.randomUUID();
    const sessionId = provider === "claude" ? id : "";
    const name = opts.name?.trim() || path.basename(cwd);

    let runDir = cwd;
    let worktree: SessionMeta["worktree"];
    if (opts.isolate) {
      const info = await gitInfo(cwd);
      if (!info.isRepo || !info.repoRoot) {
        throw new Error("Cannot isolate: the selected directory is not a git repository.");
      }
      const worktreePath = path.join(WORKTREE_DIR, id);
      const wt = await addWorktree({
        repoRoot: info.repoRoot,
        worktreePath,
        name,
        shortId: id.slice(0, 8),
        base: opts.baseBranch || info.currentBranch,
      });
      runDir = wt.path;
      worktree = wt;
    }

    const meta: SessionMeta = {
      id,
      sessionId,
      provider,
      name,
      cwd: runDir,
      sourceCwd: cwd,
      createdAt: Date.now(),
      initialPrompt: opts.prompt,
      transcriptPath: "",
      worktree,
    };

    await newSession({
      id: meta.id,
      cwd: runDir,
      command: buildLaunchCommand(provider, {
        sessionId,
        name,
        resume: false,
        prompt: provider === "grok" ? opts.prompt : undefined,
      }),
      cols: opts.cols,
      rows: opts.rows,
    });

    const live = this.register(meta);
    await this.startPipe(live);
    this.persist();
    this.emit("sessions");

    if (opts.prompt?.trim() && provider === "claude") {
      void this.sendInitialPrompt(meta.id, opts.prompt.trim());
    }
    return this.toDTO(meta.id)!;
  }

  private async sendInitialPrompt(id: string, prompt: string): Promise<void> {
    const live = this.sessions.get(id);
    if (!live) return;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const cap = await capturePane(id);
      if (tuiReady(cap, live.meta.provider)) break;
    }
    await sendRaw(id, prompt);
    await new Promise((r) => setTimeout(r, 150));
    await sendRaw(id, "\r");
  }

  async input(id: string, data: Buffer | string): Promise<void> {
    if (!this.sessions.has(id)) return;
    await sendRaw(id, data);
  }

  async resize(id: string, cols: number, rows: number): Promise<void> {
    if (!this.sessions.has(id)) return;
    await resizeWindow(id, cols, rows);
  }

  async snapshot(id: string): Promise<string> {
    return capturePane(id);
  }

  async repaint(id: string, cols: number, rows: number): Promise<void> {
    if (!this.sessions.has(id) || !cols || !rows) return;
    await resizeWindow(id, cols, Math.max(2, rows - 1));
    await new Promise((r) => setTimeout(r, 60));
    await resizeWindow(id, cols, rows);
  }

  async stop(id: string): Promise<void> {
    const live = this.sessions.get(id);
    if (!live) return;
    await killSession(id);
    live.pipeWatcher?.close();
    live.pipeWatcher = null;
    live.status = "exited";
    this.emit("status", id);
  }

  async remove(id: string, force = false): Promise<void> {
    const live = this.sessions.get(id);
    if (!live) return;

    const wt = live.meta.worktree;
    if (wt && !force && (await worktreeHasChanges(wt.path))) {
      throw new DirtyWorktreeError(wt.path);
    }

    await killSession(id);
    live.pipeWatcher?.close();
    live.transcript.stop();

    if (wt) {
      try {
        await removeWorktree(wt.repoRoot, wt.path, force);
      } catch {
        /* worktree may already be gone */
      }
    }
    try {
      fs.rmSync(live.pipeFile, { force: true });
    } catch {
      /* ignore */
    }
    this.sessions.delete(id);
    this.persist();
    this.emit("sessions");
  }

  async mergeRequest(
    id: string,
    opts: { base?: string; title?: string; body?: string } = {}
  ): Promise<MergeRequestResult> {
    const live = this.sessions.get(id);
    if (!live) throw new Error("Session not found");
    return prepareMergeRequest({
      cwd: live.meta.cwd,
      branch: live.meta.worktree?.branch,
      base: opts.base,
      title: opts.title || `Voyager AI: ${live.meta.name}`,
      body: opts.body ?? "",
    });
  }

  async restart(id: string): Promise<SessionDTO | null> {
    const live = this.sessions.get(id);
    if (!live) return null;

    if (live.meta.provider === "grok" && !live.meta.sessionId) {
      const discovered = discoverGrokSessionId(live.meta.cwd, live.meta.createdAt);
      if (discovered) live.meta.sessionId = discovered;
    }

    await killSession(id);
    live.pipeWatcher?.close();
    await newSession({
      id: live.meta.id,
      cwd: live.meta.cwd,
      command: buildLaunchCommand(live.meta.provider, {
        sessionId: live.meta.sessionId,
        name: live.meta.name,
        resume: true,
      }),
    });
    live.status = "starting";
    await this.startPipe(live);
    this.persist();
    this.emit("status", id);
    return this.toDTO(id);
  }

  private async poll(): Promise<void> {
    for (const live of this.sessions.values()) {
      const alive = await sessionExists(live.meta.id);
      if (!alive) {
        if (live.status !== "exited") {
          live.status = "exited";
          this.emit("status", live.meta.id);
        }
        continue;
      }

      if (live.meta.provider === "grok" && !live.meta.sessionId) {
        const discovered = discoverGrokSessionId(live.meta.cwd, live.meta.createdAt);
        if (discovered) {
          live.meta.sessionId = discovered;
          live.transcript.setSessionId(discovered);
          this.persist();
        }
      }

      if (!live.meta.transcriptPath && live.meta.sessionId) {
        const p = findSessionTranscript(live.meta.provider, live.meta.cwd, live.meta.sessionId);
        if (p) live.meta.transcriptPath = p;
      }

      const capture = await capturePane(live.meta.id);
      live.capture = capture;
      const next = deriveStatus({
        tmuxAlive: true,
        msSinceOutput: Date.now() - live.lastOutputMs,
        capture,
        lastEntryType: live.transcript.state.lastEntryType,
        hasAnyMessage: live.transcript.state.messageCount > 0,
      });
      if (next !== live.status) {
        live.status = next;
        this.emit("status", live.meta.id);
      }
    }
  }

  private runtime(live: LiveSession): SessionRuntime {
    const t = live.transcript.state;
    const usage: TokenUsage = t.usage;
    return {
      status: live.status,
      model: t.model,
      todos: t.todos,
      usage,
      lastMessage: t.lastMessage,
      lastActivity: t.lastActivity,
      messageCount: t.messageCount,
      toolCallCount: t.toolCallCount,
    };
  }

  toDTO(id: string): SessionDTO | null {
    const live = this.sessions.get(id);
    if (!live) return null;
    return {
      ...live.meta,
      runtime: this.runtime(live),
      tmuxAlive: live.status !== "exited",
    };
  }

  list(): SessionDTO[] {
    return [...this.sessions.keys()]
      .map((id) => this.toDTO(id)!)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  shutdown(): void {
    if (this.poller) clearInterval(this.poller);
    for (const live of this.sessions.values()) {
      live.pipeWatcher?.close();
      live.transcript.stop();
    }
  }
}