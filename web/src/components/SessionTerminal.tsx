import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { MCSocket } from "../ws";

export interface TerminalSink {
  id: string;
  write: (bytes: Uint8Array) => void;
  reset: () => void;
}

export interface TerminalHandle {
  clear: () => void;
  copySelection: () => void;
  increaseFont: () => void;
  decreaseFont: () => void;
}

interface Props {
  id: string;
  socket: MCSocket;
  registerSink: (sink: TerminalSink) => void;
  unregisterSink: (id: string) => void;
}

const encoder = new TextEncoder();

function terminalTheme() {
  const light = document.documentElement.dataset.theme === "light";
  return light
    ? {
        background: "#fafbfc",
        foreground: "#1a2332",
        cursor: "#2563eb",
        selectionBackground: "rgba(37, 99, 235, 0.2)",
      }
    : {
        background: "#000000",
        foreground: "#e8edf4",
        cursor: "#4d9fff",
        selectionBackground: "rgba(77, 159, 255, 0.25)",
      };
}

export const SessionTerminal = forwardRef<TerminalHandle, Props>(function SessionTerminal(
  { id, socket, registerSink, unregisterSink },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const fontSizeRef = useRef(13);

  useImperativeHandle(ref, () => ({
    clear: () => termRef.current?.clear(),
    copySelection: () => {
      const sel = termRef.current?.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    },
    increaseFont: () => {
      if (!termRef.current) return;
      fontSizeRef.current = Math.min(20, fontSizeRef.current + 1);
      termRef.current.options.fontSize = fontSizeRef.current;
      fitRef.current?.fit();
    },
    decreaseFont: () => {
      if (!termRef.current) return;
      fontSizeRef.current = Math.max(9, fontSizeRef.current - 1);
      termRef.current.options.fontSize = fontSizeRef.current;
      fitRef.current?.fit();
    },
  }));

  useEffect(() => {
    const term = new Terminal({
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: fontSizeRef.current,
      cursorBlink: true,
      scrollback: 5000,
      theme: terminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        window.open(uri, "_blank", "noopener,noreferrer");
      })
    );
    term.open(hostRef.current!);
    termRef.current = term;
    fitRef.current = fit;

    const dims = () => ({ cols: term.cols, rows: term.rows });

    registerSink({
      id,
      write: (bytes) => term.write(bytes),
      reset: () => term.reset(),
    });

    const raf = requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
      socket.attach(id, term.cols, term.rows);
    });

    const dataSub = term.onData((d) => socket.input(id, encoder.encode(d)));

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        const { cols, rows } = dims();
        if (cols > 2 && rows > 2) socket.resize(id, cols, rows);
      } catch {
        /* ignore */
      }
    });
    ro.observe(hostRef.current!);

    const themeObserver = new MutationObserver(() => {
      term.options.theme = terminalTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    term.focus();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeObserver.disconnect();
      dataSub.dispose();
      unregisterSink(id);
      socket.detach(id);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [id, socket, registerSink, unregisterSink]);

  return (
    <div className="terminal-frame">
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
});