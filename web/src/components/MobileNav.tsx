import { LayoutList, PanelRight, Terminal } from "lucide-react";

export type MobileTab = "sessions" | "terminal" | "status";

interface Props {
  tab: MobileTab;
  attentionCount: number;
  onChange: (tab: MobileTab) => void;
}

export function MobileNav({ tab, attentionCount, onChange }: Props) {
  return (
    <nav className="mobile-nav">
      <button
        className={`mobile-nav-btn ${tab === "sessions" ? "active" : ""}`}
        onClick={() => onChange("sessions")}
      >
        <LayoutList size={18} />
        <span>Sessions</span>
        {attentionCount > 0 && <span className="mobile-nav-badge">{attentionCount}</span>}
      </button>
      <button
        className={`mobile-nav-btn ${tab === "terminal" ? "active" : ""}`}
        onClick={() => onChange("terminal")}
      >
        <Terminal size={18} />
        <span>Terminal</span>
      </button>
      <button
        className={`mobile-nav-btn ${tab === "status" ? "active" : ""}`}
        onClick={() => onChange("status")}
      >
        <PanelRight size={18} />
        <span>Status</span>
      </button>
    </nav>
  );
}