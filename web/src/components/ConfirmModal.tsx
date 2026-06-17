import { useState } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  requireTyped?: string;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  requireTyped,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const [typed, setTyped] = useState("");
  const canConfirm = !requireTyped || typed === requireTyped;

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header confirm-header">
          {variant === "danger" && <AlertTriangle size={18} className="confirm-icon" />}
          {title}
        </div>
        <div className="modal-body">
          <p className="confirm-message">{message}</p>
          {requireTyped && (
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="lbl">
                Type <strong>{requireTyped}</strong> to confirm
              </span>
              <input
                type="text"
                value={typed}
                placeholder={requireTyped}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
              />
            </label>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${variant === "danger" ? "danger-filled" : "primary"}`}
            onClick={onConfirm}
            disabled={busy || !canConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}