import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { PORT } from "./config.js";
import { SessionManager, DirtyWorktreeError } from "./sessions.js";
import { hasTmux } from "./tmux.js";
import { browse, recentProjects } from "./browse.js";
import { gitInfo } from "./git.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  if (!(await hasTmux())) {
    console.error("[voyager-ai] tmux is required but was not found on PATH.");
    process.exit(1);
  }

  const manager = new SessionManager();
  await manager.init();

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.get("/api/sessions", (_req, res) => res.json(manager.list()));

  app.post("/api/sessions", async (req, res) => {
    try {
      const { cwd, name, prompt, cols, rows, isolate, baseBranch } = req.body ?? {};
      if (!cwd || typeof cwd !== "string") {
        return res.status(400).json({ error: "cwd is required" });
      }
      const dto = await manager.create({ cwd, name, prompt, cols, rows, isolate, baseBranch });
      res.status(201).json(dto);
    } catch (err: any) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  app.get("/api/gitinfo", async (req, res) => {
    const target = typeof req.query.path === "string" ? req.query.path : "";
    if (!target) return res.status(400).json({ error: "path is required" });
    res.json(await gitInfo(target));
  });

  app.post("/api/sessions/:id/merge-request", async (req, res) => {
    try {
      if (!manager.has(req.params.id)) return res.status(404).json({ error: "not found" });
      const { base, title, body } = req.body ?? {};
      const result = await manager.mergeRequest(req.params.id, { base, title, body });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  app.post("/api/sessions/:id/stop", async (req, res) => {
    await manager.stop(req.params.id);
    res.json(manager.toDTO(req.params.id) ?? { ok: true });
  });

  app.post("/api/sessions/:id/restart", async (req, res) => {
    const dto = await manager.restart(req.params.id);
    if (!dto) return res.status(404).json({ error: "not found" });
    res.json(dto);
  });

  app.delete("/api/sessions/:id", async (req, res) => {
    const force = req.query.force === "1" || req.query.force === "true";
    try {
      await manager.remove(req.params.id, force);
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof DirtyWorktreeError) {
        return res.status(409).json({
          error: "dirty-worktree",
          message: "This session's worktree has uncommitted changes.",
          worktreePath: err.worktreePath,
        });
      }
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  app.get("/api/browse", (req, res) => {
    const target = typeof req.query.path === "string" ? req.query.path : undefined;
    try {
      res.json(browse(target));
    } catch (err: any) {
      res.status(400).json({ error: String(err?.message ?? err) });
    }
  });

  app.get("/api/recent", (_req, res) => res.json(recentProjects()));

  // Optionally serve the built frontend if it exists (production).
  const webDist = path.resolve(__dirname, "../../web/dist");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  // Each socket may be "attached" to one session for raw terminal streaming,
  // while always receiving sidebar (sessions/status) broadcasts.
  const attachments = new Map<WebSocket, string | null>();

  function send(ws: WebSocket, msg: unknown) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
  function broadcast(msg: unknown) {
    for (const ws of wss.clients) send(ws, msg);
  }

  manager.on("output", (id: string, buf: Buffer) => {
    for (const [ws, attached] of attachments) {
      if (attached === id) send(ws, { type: "output", id, data: buf.toString("base64") });
    }
  });
  manager.on("status", (id: string) => {
    const dto = manager.toDTO(id);
    if (dto) broadcast({ type: "status", session: dto });
  });
  manager.on("sessions", () => broadcast({ type: "sessions", sessions: manager.list() }));

  wss.on("connection", (ws) => {
    attachments.set(ws, null);
    send(ws, { type: "sessions", sessions: manager.list() });

    ws.on("message", async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.type) {
        case "attach": {
          attachments.set(ws, msg.id);
          // Clear the client, then force a clean full redraw at the client size.
          send(ws, { type: "clear", id: msg.id });
          if (typeof msg.cols === "number" && typeof msg.rows === "number") {
            await manager.repaint(msg.id, msg.cols, msg.rows);
          }
          break;
        }
        case "detach":
          attachments.set(ws, null);
          break;
        case "input":
          if (typeof msg.data === "string") {
            await manager.input(msg.id, Buffer.from(msg.data, "base64"));
          }
          break;
        case "resize":
          if (typeof msg.cols === "number" && typeof msg.rows === "number") {
            await manager.resize(msg.id, msg.cols, msg.rows);
          }
          break;
      }
    });

    ws.on("close", () => attachments.delete(ws));
  });

  server.listen(PORT, () => {
    console.log(`[voyager-ai] server listening on http://localhost:${PORT}`);
  });

  const shutdown = () => {
    manager.shutdown();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
