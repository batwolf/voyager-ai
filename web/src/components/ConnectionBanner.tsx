import { WifiOff } from "lucide-react";

export function ConnectionBanner() {
  return (
    <div className="conn-banner" role="status">
      <WifiOff size={14} />
      <span>Disconnected from server — live updates paused. Reconnecting automatically…</span>
    </div>
  );
}