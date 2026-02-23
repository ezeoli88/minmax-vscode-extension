import { spawn } from "child_process";
import { createConnection } from "net";
import { getCwd } from "./cwd";
import { processManager } from "../core/process-manager";

export const definition = {
  type: "function" as const,
  function: {
    name: "bash_bg",
    description:
      "Start a long-running background process (e.g., dev server). Returns immediately with PID and detected port. " +
      "Use this instead of bash for: npm run dev, node server.js, python -m http.server, etc. " +
      "The process runs detached. Use stop_server to stop it when done.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to run in background",
        },
        port: {
          type: "number",
          description: "Expected port number. If omitted, auto-detected from output.",
        },
        wait_for_port: {
          type: "boolean",
          description: "Wait until the port accepts connections before returning. Default true.",
        },
      },
      required: ["command"],
    },
  },
};

const PORT_PATTERNS = [
  /(?:listening|running|started|ready|available|serving)\s+(?:on|at)\s+(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0):?(\d{2,5})/i,
  /port\s+(\d{2,5})/i,
  /localhost:(\d{2,5})/i,
  /127\.0\.0\.1:(\d{2,5})/i,
  /0\.0\.0\.0:(\d{2,5})/i,
];

function detectPort(text: string): number | null {
  for (const pattern of PORT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const port = parseInt(match[1], 10);
      if (port >= 1024 && port <= 65535) return port;
    }
  }
  return null;
}

function detectPortFromCommand(command: string): number | null {
  const patterns = [
    /--port[=\s]+(\d{2,5})/i,
    /-p\s+(\d{2,5})/,
  ];
  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match) {
      const port = parseInt(match[1], 10);
      if (port >= 1024 && port <= 65535) return port;
    }
  }
  return null;
}

function waitForPort(port: number, timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();

    function attempt() {
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }

      const socket = createConnection({ port, host: "127.0.0.1" });
      socket.setTimeout(1000);

      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });

      socket.on("error", () => {
        socket.destroy();
        setTimeout(attempt, 500);
      });

      socket.on("timeout", () => {
        socket.destroy();
        setTimeout(attempt, 500);
      });
    }

    attempt();
  });
}

export async function execute(args: {
  command: string;
  port?: number;
  wait_for_port?: boolean;
}): Promise<string> {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd" : "bash";
    const shellFlag = isWindows ? "/c" : "-c";

    const proc = spawn(shell, [shellFlag, args.command], {
      cwd: getCwd(),
      env: { ...process.env },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const pid = proc.pid;
    if (!pid) {
      resolve("Error: Failed to start process (no PID returned)");
      return;
    }

    let stdout = "";
    let stderr = "";
    let detectedPort = args.port ?? detectPortFromCommand(args.command);
    let startupErrorDetected = false;

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
      if (!detectedPort) detectedPort = detectPort(stdout);
      if (stdout.length > 5000) stdout = stdout.slice(0, 5000);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (!detectedPort) detectedPort = detectPort(stderr);
      if (stderr.length > 5000) stderr = stderr.slice(0, 5000);
    });

    proc.on("exit", (code) => {
      if (code !== null && code !== 0) startupErrorDetected = true;
    });

    proc.unref();
    proc.stdout?.unref?.();
    proc.stderr?.unref?.();

    // Capture initial output for 3 seconds
    setTimeout(async () => {
      if (startupErrorDetected) {
        resolve(
          `Error: Process exited immediately.\nstdout: ${stdout}\nstderr: ${stderr}`
        );
        return;
      }

      const port = detectedPort;
      const shouldWait = args.wait_for_port !== false && port !== null;

      if (shouldWait && port) {
        const ready = await waitForPort(port, 15000);
        if (!ready) {
          processManager.register({ pid, port, command: args.command, startTime: Date.now() });
          resolve(
            `Process started (PID ${pid}) but port ${port} not ready after 15s.\nstdout: ${stdout}\nstderr: ${stderr}`
          );
          return;
        }
      }

      processManager.register({
        pid,
        port: port ?? null,
        command: args.command,
        startTime: Date.now(),
      });

      proc.stdout?.destroy();
      proc.stderr?.destroy();

      let output = `Process started (PID ${pid})`;
      if (port) output += `, listening on port ${port}`;
      if (stdout.trim()) output += `\nstdout: ${stdout.trim().slice(0, 2000)}`;
      if (stderr.trim()) output += `\nstderr: ${stderr.trim().slice(0, 2000)}`;

      resolve(output);
    }, 3000);
  });
}
