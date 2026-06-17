import { useEffect } from "react";
import { Command } from "cmdk";
import { Plus } from "lucide-react";
import type { SessionDTO } from "../types";
import { StatusBadge } from "./StatusBadge";

interface Props {
  open: boolean;
  sessions: SessionDTO[];
  selectedId: string | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function SessionSwitcher({ open, sessions, selectedId, onOpenChange, onSelect, onNew }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Switch session"
      className="cmdk-dialog"
      overlayClassName="cmdk-overlay"
    >
      <div className="cmdk">
        <Command.Input placeholder="Search sessions…" className="cmdk-input" />
        <Command.List className="cmdk-list">
          <Command.Empty className="cmdk-empty">No matching sessions.</Command.Empty>

          {sessions.length > 0 && (
            <Command.Group heading="Sessions" className="cmdk-group">
              {sessions.map((s, i) => (
                <Command.Item
                  key={s.id}
                  value={`${s.name} ${s.cwd} ${s.worktree?.branch ?? ""}`}
                  className="cmdk-item"
                  onSelect={() => {
                    onSelect(s.id);
                    onOpenChange(false);
                  }}
                >
                  <span className="cmdk-item-index">{i < 9 ? i + 1 : "·"}</span>
                  <span className="cmdk-item-body">
                    <span className="cmdk-item-name">{s.name}</span>
                    <span className="cmdk-item-path">
                      {s.worktree ? s.worktree.repoRoot : s.cwd}
                    </span>
                  </span>
                  <StatusBadge status={s.runtime.status} />
                  {s.id === selectedId && <span className="cmdk-item-active">Current</span>}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Separator className="cmdk-separator" />

          <Command.Group heading="Actions" className="cmdk-group">
            <Command.Item
              value="new session create"
              className="cmdk-item"
              onSelect={() => {
                onOpenChange(false);
                onNew();
              }}
            >
              <Plus size={14} />
              <span>New session</span>
              <kbd className="kbd">⌘N</kbd>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}