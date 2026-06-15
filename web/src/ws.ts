import type { SessionDTO } from "./types";

type Handlers = {
  onSessions?: (sessions: SessionDTO[]) => void;
  onStatus?: (session: SessionDTO) => void;
  onOutput?: (id: string, data: Uint8Array) => void;
  onClear?: (id: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

/** Thin reconnecting WebSocket client for the Voyager AI protocol. */
export class MCSocket {
  private ws: WebSocket | null = null;
  private handlers: Handlers = {};
  private reconnectTimer: number | null = null;
  private closed = false;

  connect(handlers: Handlers) {
    this.handlers = handlers;
    this.open();
  }

  private open() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => this.handlers.onOpen?.();
    ws.onclose = () => {
      this.handlers.onClose?.();
      if (!this.closed) this.scheduleReconnect();
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "sessions":
          this.handlers.onSessions?.(msg.sessions);
          break;
        case "status":
          this.handlers.onStatus?.(msg.session);
          break;
        case "output":
          this.handlers.onOutput?.(msg.id, base64ToBytes(msg.data));
          break;
        case "clear":
          this.handlers.onClear?.(msg.id);
          break;
      }
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, 1000);
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  attach(id: string, cols: number, rows: number) {
    this.send({ type: "attach", id, cols, rows });
  }
  detach(id: string) {
    this.send({ type: "detach", id });
  }
  input(id: string, data: Uint8Array) {
    this.send({ type: "input", id, data: bytesToBase64(data) });
  }
  resize(id: string, cols: number, rows: number) {
    this.send({ type: "resize", id, cols, rows });
  }
  close() {
    this.closed = true;
    this.ws?.close();
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
