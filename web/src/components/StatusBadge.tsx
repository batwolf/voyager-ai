import type { SessionStatus } from "../types";

const LABELS: Record<SessionStatus, string> = {
  starting: "Starting",
  running: "Running",
  waiting: "Waiting",
  "needs-input": "Needs input",
  idle: "Idle",
  error: "Error",
  exited: "Exited",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={`status-badge st-${status}`}>
      <span className="pip" />
      {LABELS[status]}
    </span>
  );
}
