import { spawn, type ChildProcess } from "child_process";
import { getCwd } from "./cwd";

export const definition = {
  type: "function" as const,
  function: {
    name: "bash",
    description:
      "Execute a shell command. Use for: running scripts, git operations, installing packages, or any terminal task. Timeout: 30s. Output truncated at 10KB. Prefer other tools over bash when possible (e.g., use read_file instead of cat, glob instead of find). IMPORTANT: Do NOT use this to start long-running servers (node server.js, npm start, etc.) — use it only for commands that finish quickly.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
      },
      required: ["command"],
    },
  },
};

let activeProcess: ChildProcess | null = null;

export function killActiveProcess(): void {
  if (activeProcess) {
    activeProcess.kill("SIGTERM");
    activeProcess = null;
  }
}

export async function execute(
  args: { command: string },
  signal?: AbortSignal
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd" : "bash";
    const shellFlag = isWindows ? "/c" : "-c";

    const proc = spawn(shell, [shellFlag, args.command], {
      cwd: getCwd(),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    activeProcess = proc;

    let stdout = "";
    let stderr = "";
    let killed = false;
    let killReason = "";

    const timeout = setTimeout(() => {
      killed = true;
      killReason = "30s timeout";
      proc.kill("SIGTERM");
    }, 30_000);

    // Handle abort signal (user cancel)
    const onAbort = () => {
      killed = true;
      killReason = "cancelled by user";
      proc.kill("SIGTERM");
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      activeProcess = null;

      if (killed) {
        stderr += `\n(process killed: ${killReason})`;
      }

      const maxLen = 10000;
      resolve({
        stdout: stdout.length > maxLen ? stdout.slice(0, maxLen) + "\n...(truncated)" : stdout,
        stderr: stderr.length > maxLen ? stderr.slice(0, maxLen) + "\n...(truncated)" : stderr,
        exitCode: code ?? 1,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      activeProcess = null;
      resolve({
        stdout: "",
        stderr: `Failed to spawn process: ${err.message}`,
        exitCode: 1,
      });
    });
  });
}
