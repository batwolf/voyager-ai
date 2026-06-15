import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { MCSocket } from "../ws";

export interface TerminalSink {
  id: string;
  write: (bytes: Uint8Array) => void;
  reset: () => void;
}

interface Props {
  id: string;
  socket: MCSocket;
  registerSink: (sink: TerminalSink) => void;
  unregisterSink: (id: string) => void;
}

const encoder = new TextEncoder();

export function SessionTerminal({ id, socket, registerSink, unregisterSink }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = new Terminal({
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 12,
      cursorBlink: true,
      scrollback: 5000,
      theme: { background: "#000000", foreground: "#e6edf3" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // Make URLs (e.g. Claude's login/"get tokens" link) clickable, opening in a
    // new tab so they never replace the terminal view.
    term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        window.open(uri, "_blank", "noopener,noreferrer");
      })
    );
    term.open(hostRef.current!);

    const dims = () => ({ cols: term.cols, rows: term.rows });

    registerSink({
      id,
      write: (bytes) => term.write(bytes),
      reset: () => term.reset(),
    });

    // Fit only once layout has settled, then attach (the server resizes the
    // pane to these dims and forces a clean redraw).
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
        /* ignore transient resize errors */
      }
    });
    ro.observe(hostRef.current!);

    term.focus();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dataSub.dispose();
      unregisterSink(id);
      socket.detach(id);
      term.dispose();
    };
  }, [id, socket, registerSink, unregisterSink]);

  return <div className="terminal-host" ref={hostRef} />;
}
