import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

interface TerminalOutputProps {
  content: string;
}

export function TerminalOutput({ content }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      disableStdin: true,
      cursorStyle: "bar",
      cursorInactiveStyle: "none",
      fontSize: 12,
      fontFamily: '"Fira Code", "Cascadia Code", "Consolas", monospace',
      lineHeight: 1.4,
      scrollback: 5000,
      convertEol: false,
      theme: {
        background: "#1e1e2e",
        foreground: "#cdd6f4",
        cursor: "#1e1e2e",
        black: "#45475a",
        red: "#f38ba8",
        green: "#a6e3a1",
        yellow: "#f9e2af",
        blue: "#89b4fa",
        magenta: "#cba6f7",
        cyan: "#94e2d5",
        white: "#bac2de",
        brightBlack: "#585b70",
        brightRed: "#f38ba8",
        brightGreen: "#a6e3a1",
        brightYellow: "#f9e2af",
        brightBlue: "#89b4fa",
        brightMagenta: "#cba6f7",
        brightCyan: "#94e2d5",
        brightWhite: "#a6adc8",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    // Fit after opening
    try {
      fitAddon.fit();
    } catch {
      // ignore fit errors on initial render
    }

    // Write content, normalizing \n to \r\n for xterm
    const normalized = content.replace(/\r?\n/g, "\r\n");
    terminal.write(normalized, () => {
      terminal.scrollToTop();
    });

    terminalRef.current = terminal;

    // ResizeObserver for sidebar width changes
    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // ignore fit errors during resize
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [content]);

  return <div ref={containerRef} className="terminal-output" />;
}
