import { useEffect, useState } from "react";
import { api } from "../api";
import type { BrowseResult, GitInfo } from "../types";

interface Props {
  onClose: () => void;
  onCreate: (body: {
    cwd: string;
    name?: string;
    prompt?: string;
    isolate?: boolean;
    baseBranch?: string;
  }) => Promise<void>;
}

export function NewSessionModal({ onClose, onCreate }: Props) {
  const [cwd, setCwd] = useState("");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [browser, setBrowser] = useState<BrowseResult | null>(null);
  const [git, setGit] = useState<GitInfo | null>(null);
  const [isolate, setIsolate] = useState(true);
  const [baseBranch, setBaseBranch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.recent().then(setRecent).catch(() => {});
    api.browse().then(setBrowser).catch(() => {});
  }, []);

  // Probe git status whenever the chosen directory changes.
  useEffect(() => {
    const dir = cwd.trim();
    if (!dir) {
      setGit(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .gitInfo(dir)
        .then((info) => {
          if (cancelled) return;
          setGit(info);
          setIsolate(info.isRepo); // default: isolate when it's a repo
          if (info.currentBranch) setBaseBranch(info.currentBranch);
        })
        .catch(() => !cancelled && setGit(null));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cwd]);

  const go = async (path?: string) => {
    try {
      setBrowser(await api.browse(path));
    } catch (e: any) {
      setError(String(e.message));
    }
  };

  const submit = async () => {
    if (!cwd.trim()) {
      setError("Pick a working directory.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        cwd: cwd.trim(),
        name: name.trim() || undefined,
        prompt: prompt.trim() || undefined,
        isolate: git?.isRepo ? isolate : false,
        baseBranch: isolate ? baseBranch.trim() || undefined : undefined,
      });
      onClose();
    } catch (e: any) {
      setError(String(e.message));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">New Claude Code session</div>
        <div className="modal-body">
          <label className="field">
            <span className="lbl">Working directory</span>
            <input
              type="text"
              value={cwd}
              placeholder="/path/to/project"
              onChange={(e) => setCwd(e.target.value)}
            />
          </label>

          {recent.length > 0 && (
            <label className="field">
              <span className="lbl">Recent</span>
              <div className="chips">
                {recent.map((r) => (
                  <span key={r} className="chip" onClick={() => setCwd(r)} title={r}>
                    {r.split("/").slice(-2).join("/")}
                  </span>
                ))}
              </div>
            </label>
          )}

          <label className="field">
            <span className="lbl">Browse</span>
            <div className="browser">
              {browser && (
                <>
                  <div className="browser-path">{browser.path}</div>
                  {browser.parent && (
                    <div className="browser-row" onClick={() => go(browser.parent!)}>
                      📁 ..
                    </div>
                  )}
                  <div className="browser-row" onClick={() => setCwd(browser.path)} style={{ color: "var(--accent)" }}>
                    ✓ Use this directory
                  </div>
                  {browser.dirs.map((d) => (
                    <div key={d.path} className="browser-row" onClick={() => go(d.path)}>
                      📁 {d.name}
                    </div>
                  ))}
                </>
              )}
            </div>
          </label>

          <label className="field">
            <span className="lbl">Display name (optional)</span>
            <input type="text" value={name} placeholder="defaults to folder name" onChange={(e) => setName(e.target.value)} />
          </label>

          {git?.isRepo && (
            <div className="field">
              <label className="checkbox-row">
                <input type="checkbox" checked={isolate} onChange={(e) => setIsolate(e.target.checked)} />
                <span>
                  Isolate in a git worktree
                  <span className="hint"> — runs on a fresh mc/{name.trim() || "…"} branch</span>
                </span>
              </label>
              {isolate && (
                <div style={{ marginTop: 8 }}>
                  <span className="lbl">Base branch</span>
                  <input
                    type="text"
                    list="mc-branches"
                    value={baseBranch}
                    placeholder={git.currentBranch ?? "main"}
                    onChange={(e) => setBaseBranch(e.target.value)}
                  />
                  <datalist id="mc-branches">
                    {(git.branches ?? []).map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>
          )}
          {git && !git.isRepo && cwd.trim() && (
            <div className="field hint">Not a git repository — the session will run directly in this folder.</div>
          )}

          <label className="field">
            <span className="lbl">Initial prompt (optional)</span>
            <textarea value={prompt} placeholder="What should this session work on?" onChange={(e) => setPrompt(e.target.value)} />
          </label>

          {error && <div className="error-text">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? "Starting…" : "Start session"}
          </button>
        </div>
      </div>
    </div>
  );
}
