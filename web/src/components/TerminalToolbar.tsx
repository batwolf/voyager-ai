import { Copy, Minus, Plus, Trash2 } from "lucide-react";
import type { TerminalHandle } from "./SessionTerminal";

interface Props {
  terminalRef: React.RefObject<TerminalHandle | null>;
}

export function TerminalToolbar({ terminalRef }: Props) {
  return (
    <div className="terminal-toolbar">
      <button
        className="btn ghost icon-only"
        title="Clear terminal"
        onClick={() => terminalRef.current?.clear()}
      >
        <Trash2 size={14} />
      </button>
      <button
        className="btn ghost icon-only"
        title="Copy selection"
        onClick={() => terminalRef.current?.copySelection()}
      >
        <Copy size={14} />
      </button>
      <span className="terminal-toolbar-divider" />
      <button
        className="btn ghost icon-only"
        title="Decrease font size"
        onClick={() => terminalRef.current?.decreaseFont()}
      >
        <Minus size={14} />
      </button>
      <button
        className="btn ghost icon-only"
        title="Increase font size"
        onClick={() => terminalRef.current?.increaseFont()}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}