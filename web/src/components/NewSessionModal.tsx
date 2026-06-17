import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Folder, FolderUp } from "lucide-react";
import { api } from "../api";
import type { AgentProvider, BrowseResult, GitInfo } from "../types";

const PROVIDER_OPTIONS: { id: AgentProvider; label: string; description: string }[] = [
  { id: "claude", label: "Claude", description: "Anthropic Claude Code CLI" },
  { id: "grok", label: "Grok", description: "xAI Grok Build CLI" },
];

interface Props {
  onClose: () => void;
  onCreate: (body: {
    cwd: string;
    provider: AgentProvider;
    name?: string;
    prompt?: string;
    isolate?: boolean;
    baseBranch?: string;
  }) => Promise<void>;
}

const STEPS = [
  { id: "where", label: "Where" },
  { id: "how", label: "How" },
  { id: "what", label: "What" },
] as const;

export function NewSessionModal({ onClose, onCreate }: Props) {
  const [step, setStep] = useState(0);
  const [cwd, setCwd] = useState("");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [browser, setBrowser] = useState<BrowseResult | null>(null);
  const [git, setGit] = useState<GitInfo | null>(null);
  const [isolate, setIsolate] = useState(true);
  const [baseBranch, setBaseBranch] = useState("");
  const [availableProviders, setAvailableProviders] = useState<AgentProvider[]>([]);
  const [provider, setProvider] = useState<AgentProvider | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.recent().then(setRecent).catch(() => {});
    api.browse().then(setBrowser).catch(() => {});
    api
      .providers()
      .then((list) => {
        setAvailableProviders(list);
        setProvider((current) => current ?? list[0] ?? null);
      })
      .catch(() => setAvailableProviders([]));
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
          setIsolate(info.isRepo);
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

  const next = () => {
    setError(null);
    if (step === 0 && !cwd.trim()) {
      setError("Pick a working directory.");
      return;
    }
    if (step === 1 && !provider) {
      setError("Pick an agent — install Claude Code or Grok CLI on this machine.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const back = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const submit = async () => {
    if (!cwd.trim()) {
      setError("Pick a working directory.");
      setStep(0);
      return;
    }
    if (!provider) {
      setError("Pick an agent — install Claude Code or Grok CLI on this machine.");
      setStep(1);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        cwd: cwd.trim(),
        provider,
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
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header stepped">
          <span>New agent session</span>
          <div className="stepper">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
              >
                <span className="step-num">{i + 1}</span>
                <span className="step-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-body">
          {step === 0 && (
            <>
              <label className="field">
                <span className="lbl">Working directory</span>
                <input
                  type="text"
                  value={cwd}
                  placeholder="/path/to/project"
                  onChange={(e) => setCwd(e.target.value)}
                  autoFocus
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
                          <FolderUp size={14} />
                          ..
                        </div>
                      )}
                      <div
                        className="browser-row"
                        onClick={() => setCwd(browser.path)}
                        style={{ color: "var(--accent)" }}
                      >
                        <Check size={14} />
                        Use this directory
                      </div>
                      {browser.dirs.map((d) => (
                        <div key={d.path} className="browser-row" onClick={() => go(d.path)}>
                          <Folder size={14} />
                          {d.name}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </label>
            </>
          )}

          {step === 1 && (
            <>
              <div className="step-summary">
                <span className="lbl">Directory</span>
                <code>{cwd}</code>
              </div>

              <div className="field">
                <span className="lbl">Agent</span>
                <div className="provider-picker">
                  {PROVIDER_OPTIONS.map((opt) => {
                    const available = availableProviders.includes(opt.id);
                    const selected = provider === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={[
                          "provider-option",
                          selected ? "selected" : "",
                          available ? "" : "unavailable",
                        ].join(" ")}
                        disabled={!available}
                        onClick={() => available && setProvider(opt.id)}
                      >
                        <span className="provider-option-label">{opt.label}</span>
                        <span className="provider-option-desc">
                          {available ? opt.description : "Not installed on this machine"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {git?.isRepo ? (
                <div className="field">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={isolate}
                      onChange={(e) => setIsolate(e.target.checked)}
                    />
                    <span>
                      Isolate in a git worktree
                      <span className="hint">
                        {" "}
                        — runs on a fresh mc/{name.trim() || "…"} branch
                      </span>
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
              ) : (
                <div className="step-note">
                  Not a git repository — the session will run directly in this folder with no
                  worktree isolation.
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="step-summary">
                <span className="lbl">Agent</span>
                <span>{PROVIDER_OPTIONS.find((p) => p.id === provider)?.label ?? "—"}</span>
                <span className="lbl" style={{ marginTop: 10 }}>
                  Directory
                </span>
                <code>{cwd}</code>
                {git?.isRepo && (
                  <>
                    <span className="lbl" style={{ marginTop: 10 }}>
                      Isolation
                    </span>
                    <span>
                      {isolate
                        ? `Git worktree from ${baseBranch || git.currentBranch || "main"}`
                        : "Direct — no worktree"}
                    </span>
                  </>
                )}
              </div>

              <label className="field">
                <span className="lbl">Display name (optional)</span>
                <input
                  type="text"
                  value={name}
                  placeholder="defaults to folder name"
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </label>

              <label className="field">
                <span className="lbl">Initial prompt (optional)</span>
                <textarea
                  value={prompt}
                  placeholder="What should this session work on?"
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </label>
            </>
          )}

          {error && <div className="error-text">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <div className="modal-footer-actions">
            {step > 0 && (
              <button className="btn ghost" onClick={back} disabled={busy}>
                <ChevronLeft size={14} />
                Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button className="btn primary" onClick={next} disabled={busy}>
                Next
                <ChevronRight size={14} />
              </button>
            ) : (
              <button className="btn primary" onClick={submit} disabled={busy}>
                {busy ? "Starting…" : "Start session"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}