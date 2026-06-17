import { ChevronDown } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

interface Props {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function loadOpen(id: string, defaultOpen: boolean): boolean {
  const stored = localStorage.getItem(`voyager-section-${id}`);
  if (stored === "0") return false;
  if (stored === "1") return true;
  return defaultOpen;
}

export function CollapsibleSection({ id, title, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(() => loadOpen(id, defaultOpen));

  useEffect(() => {
    localStorage.setItem(`voyager-section-${id}`, open ? "1" : "0");
  }, [id, open]);

  return (
    <div className={`panel-section collapsible ${open ? "open" : "closed"}`}>
      <button className="section-toggle" onClick={() => setOpen((o) => !o)} type="button">
        <h2>{title}</h2>
        <ChevronDown size={14} className="section-chevron" />
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}