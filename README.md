<div align="center">

# 🛰️ Voyager AI

**Run and manage a fleet of Claude Code sessions from one local dashboard.**

Each session is a real interactive `claude` TUI, mirrored into your browser, with a live
status panel — model, tokens, todos, and the latest message — derived straight from the
session transcript.

![stack](https://img.shields.io/badge/stack-React%20%2B%20Node%20%2B%20tmux-blue)
![node](https://img.shields.io/badge/node-18%2B-339933?logo=node.js&logoColor=white)
![license](https://img.shields.io/badge/license-MIT-green)
![status](https://img.shields.io/badge/status-v1-orange)

</div>

---

## Why Voyager AI?

Running several Claude Code sessions at once usually means juggling terminal tabs and losing
track of which one needs you. Voyager AI gives every session a real terminal in your browser
plus an at-a-glance status board, so you can pilot many agents in parallel and jump to
whichever one is waiting on input.

- 🖥️ **Real terminals, not a wrapper** — each session is the genuine interactive `claude` TUI;
  type, approve prompts, interrupt, and scroll exactly as you would in a shell.
- 📊 **Live status for every session** — model, token usage, todo progress, message/tool
  counts, and the last message, parsed directly from the transcript.
- 💪 **Survives restarts** — sessions live in `tmux`, so they keep running even if the Voyager
  server goes down; it re-adopts its `mc_*` panes on boot.
- 🌿 **Git worktree isolation** — start a session in an isolated worktree on its own branch so
  parallel agents never step on each other's working tree.
## How it works

Each session is a real `claude` process running inside its own **tmux** session:

- **Control plane** — `tmux pipe-pane` streams the pane's raw output to the browser (rendered
  with [xterm.js](https://xtermjs.org/)); your keystrokes are forwarded back with
  `tmux send-keys -H` (raw hex), so the terminal is fully interactive.
- **Data plane** — each session launches with a pinned `--session-id`, so the server knows
  exactly which `~/.claude/projects/.../<id>.jsonl` transcript to tail. It parses that stream
  for model, token usage, todo list, message/tool counts, and the latest message.

> [!NOTE]
> Spawned sessions launch with Claude's nested-agent environment variables stripped
> (`CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_CHILD_SESSION`, …) so each runs as a
> clean top-level session and persists its transcript normally.

## Requirements

- **Node.js** 18+ (developed on 25)
- **tmux** — `brew install tmux`
- **claude** CLI on your `PATH` (or set `MC_CLAUDE_BIN`)

## Quick start

```bash
git clone https://github.com/<you>/voyager-ai.git
cd voyager-ai

npm run install:all   # installs root, server, and web deps
npm run dev           # starts server (:8787) + web (:5173)
```

Then open **http://localhost:5173**.

For a single-process production run:

```bash
npm run build                 # builds the web app into web/dist
npm --prefix server run start # server serves the built UI on :8787
```

## Usage

1. Click **➕ New session**, pick a working directory (recent projects and a folder browser are
   provided), optionally a display name and an initial prompt.
2. The session boots in a tmux pane; its terminal streams into the main view.
3. The sidebar shows every session with a live status badge:
   - 🟢 **Running** — actively producing output
   - 🔵 **Waiting** — idle, awaiting your input
   - 🟡 **Needs input** — a confirmation/permission prompt is on screen
   - 🟣 **Starting** · ⚪ **Idle** · 🔴 **Exited**
4. The right panel shows model, token usage, the todo list, and the last message.
5. **Stop** ends the tmux session (resumable). **Restart/Resume** relaunches via
   `claude --resume`. **Remove** deletes it permanently.

## Git worktree isolation

When you start a session in a directory that's a **git repository**, the New Session dialog
offers **"Isolate in a git worktree"** (on by default):

- The session runs in a fresh worktree under `~/.mc/worktrees/<id>`, checked out on a new
  `mc/<name>` branch forked from the base branch you pick (defaults to the repo's current
  branch). Two sessions never touch the same working tree.
- The branch is shown as a `⎇ mc/<name>` chip in the sidebar and toolbar.
- **Remove** deletes the worktree but **keeps the branch**, so committed work is never lost. If
  the worktree has uncommitted changes the server refuses (HTTP `409`) and the UI asks whether
  to force-remove and discard them.

Non-git directories (or unchecking the box) run the session directly in place.

## Configuration

| Env var               | Default  | Purpose                                                                                     |
| --------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `MC_PORT`             | `8787`   | Server port                                                                                  |
| `MC_CLAUDE_BIN`       | `claude` | Path to the claude binary                                                                    |
| `MC_DATA_DIR`         | `~/.mc`  | Session registry + pipe logs                                                                 |
| `MC_SKIP_PERMISSIONS` | `1` (on) | Launch sessions with `--dangerously-skip-permissions`; set `0` to require manual approvals   |

> [!WARNING]
> Sessions run unattended by default (`--dangerously-skip-permissions`) so they don't stall on
> permission prompts inside the dashboard. Set `MC_SKIP_PERMISSIONS=0` if you'd rather approve
> tool calls in each session.

## Architecture

```
web/    React + Vite + xterm.js
server/ Express + ws + tmux
  ├─ tmux.ts        tmux wrapper (pipe-pane / send-keys -H / capture-pane)
  ├─ sessions.ts    lifecycle, raw I/O mirroring, status polling
  ├─ transcript.ts  incremental JSONL tail → structured runtime state
  ├─ status.ts      status heuristics (output activity + screen markers)
  ├─ paths.ts       transcript location (by uuid)
  ├─ git.ts         worktree create/remove + merge-request preparation
  ├─ browse.ts      directory picker + recent projects
  └─ index.ts       REST + WebSocket server
```

## Known limitations (v1)

- Status detection (`needs-input` vs `running`) is heuristic, based on screen markers and
  output activity; refine `status.ts` to taste.
- Pipe-pane log files in `~/.mc/pipes` grow for the session lifetime.
- "Prepare Merge Request" commits **all** pending changes in the worktree with a generic
  message — review the branch before merging.
- Single-user, localhost, no auth — don't expose the port publicly.
- Desktop notifications are not wired up yet.

## Contributing

Issues and pull requests are welcome. For larger changes, open an issue first to discuss what
you'd like to change.

## License

[MIT](LICENSE)
